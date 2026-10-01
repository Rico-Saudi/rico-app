import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { PhotosService } from './photos.service';

@Controller()
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  /// GET /places/:id/photo?w=800
  ///
  /// Redirects to the real image rather than streaming it: the bytes then come
  /// from Google's CDN straight to the device, which is faster for the user
  /// and keeps our bandwidth out of it. The API key never leaves this process.
  @Get('places/:id/photo')
  async getPhoto(@Param('id') id: string, @Query('w') w: string, @Res() res: Response) {
    const width = PhotosService.normalizeWidth(w);
    const url = await this.photosService.resolvePhotoUrl(id, width);

    if (!url) {
      // The client already draws a category glyph for places with no photo, so
      // this is an expected outcome, not an error worth retrying.
      res.status(404).json({ error: 'no_photo' });
      return;
    }

    // Lets the device and any CDN in between reuse this redirect instead of
    // asking us again on every scroll. Comfortably shorter than the lifetime
    // of the URL it points at.
    res.set('Cache-Control', 'public, max-age=1800');
    res.redirect(302, url);
  }
}
