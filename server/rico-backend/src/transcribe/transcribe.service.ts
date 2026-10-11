import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { brandFor } from '../common/constants/brands';
import { buildVocabHint, isLikelySilence, STT_MODEL } from './constants/transcribe.constants';

// What a phone can realistically send. The client records aac-lc in m4a,
// but the Content-Type on a multipart upload is whatever the HTTP client
// felt like putting there, so this is deliberately permissive:
//
// - 'application/octet-stream' is what Dart's MultipartFile.fromPath sends
//   when no type is passed, and it's the generic default for most upload
//   libraries. Rejecting it means rejecting the actual app.
// - m4a legitimately arrives as audio/*, video/mp4 (it's an MP4 container)
//   or video/3gpp depending on the platform.
//
// Whether the bytes are really decodable audio isn't knowable from a header
// the client controls — Groq rejects genuinely bad audio, and the size cap
// bounds the cost of finding out. This check only turns away uploads that
// are declared as something clearly wrong (JSON, text, images).
const ALLOWED_MIME_PREFIXES = ['audio/', 'video/mp4', 'video/3gpp', 'application/octet-stream'];

@Injectable()
export class TranscribeService {
  async transcribe(audio?: Express.Multer.File, brand?: string) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new HttpException({ error: 'server_misconfigured' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    if (!audio || !audio.buffer?.length) {
      throw new HttpException({ error: 'no_audio' }, HttpStatus.BAD_REQUEST);
    }

    const mime = audio.mimetype || '';
    if (!ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
      throw new HttpException({ error: 'unsupported_audio_type' }, HttpStatus.BAD_REQUEST);
    }

    const form = new FormData();
    // Copied into a Uint8Array rather than passed as a Node Buffer: a
    // Buffer's backing store is typed as ArrayBufferLike (possibly shared),
    // which BlobPart doesn't accept. The copy is bounded by MAX_AUDIO_BYTES.
    const bytes = new Uint8Array(audio.buffer);
    // Forward a concrete audio type rather than whatever generic default the
    // client used — Groq picks its decoder from this, and 'octet-stream'
    // tells it nothing. The filename extension carries the real format.
    const filename = audio.originalname || 'voice.m4a';
    const upstreamMime = mime.startsWith('application/') ? 'audio/mp4' : mime;
    form.append('file', new Blob([bytes], { type: upstreamMime }), filename);
    form.append('model', STT_MODEL);
    // Rico is Saudi-only, and pinning the language stops Whisper from
    // "detecting" a heavily-accented clip as Farsi/Urdu and transliterating
    // it into something the classifier can't parse.
    form.append('language', 'ar');
    form.append('response_format', 'json');
    form.append('prompt', buildVocabHint(brandFor(brand)));
    // Deterministic: this is a transcription, not a generation — there is
    // nothing to gain from sampling variety in a search query.
    form.append('temperature', '0');

    let groqResponse: Response;
    try {
      groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
    } catch {
      throw new HttpException({ error: 'upstream_unreachable' }, HttpStatus.BAD_GATEWAY);
    }

    if (!groqResponse.ok) {
      throw new HttpException({ error: 'upstream_error', status: groqResponse.status }, HttpStatus.BAD_GATEWAY);
    }

    let parsed: any;
    try {
      parsed = await groqResponse.json();
    } catch {
      throw new HttpException({ error: 'parse_error' }, HttpStatus.BAD_GATEWAY);
    }

    const text = typeof parsed?.text === 'string' ? parsed.text.trim() : '';

    // An empty (or hallucinated-from-silence) transcript is a 200 with an
    // empty string, not an error: the user didn't say anything intelligible,
    // which the client answers with "ما سمعتك زين" — a different message
    // from the network/server failures above.
    return { text: isLikelySilence(text) ? '' : text };
  }
}
