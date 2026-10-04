import { validateIntent } from '../intent-validation';
import { keywordClassifyInContext } from './keyword-classifier';

const none = { history: [], lastResults: null };
const listed = {
  history: [{ role: 'user', content: 'وش المطاعم القريبة' }],
  lastResults: {
    label: 'مطعم',
    items: [
      { position: 1, name: 'مطعم البيك' },
      { position: 2, name: 'مطعم الماهر' },
    ],
  },
};

describe('call intent', () => {
  it.each([
    ['اتصل على مطعم الماهر', 'مطعم الماهر'],
    ['اتصل بمطعم الماهر', 'مطعم الماهر'],
    ['ممكن تتصل على صيدلية النهدي لو سمحت', 'صيدلية النهدي'],
    ['كلّم لي كافيه الركن', 'كافيه الركن'],
    ['دق على بقالة النور الحين', 'بقالة النور'],
    ['وش رقم صيدلية النهدي؟', 'صيدلية النهدي'],
    ['بدي رقم تلفون مطعم الماهر', 'مطعم الماهر'],
  ])('reads "%s" as a call to %s', (message, placeName) => {
    expect(keywordClassifyInContext(message, none)).toEqual([expect.objectContaining({ kind: 'call', placeName })]);
  });

  it('resolves a position on the list Rico just showed', () => {
    expect(keywordClassifyInContext('اتصل على الثاني', listed)).toEqual([
      expect.objectContaining({ kind: 'call', referencedPosition: 2, placeName: 'مطعم الماهر' }),
    ]);
  });

  it('resolves "them" when the list has one shop', () => {
    const one = { ...listed, lastResults: { label: 'مطعم', items: [{ position: 1, name: 'مطعم الماهر' }] } };
    expect(keywordClassifyInContext('كلمهم', one)).toEqual([
      expect.objectContaining({ kind: 'call', referencedPosition: 1, placeName: 'مطعم الماهر' }),
    ]);
  });

  it.each([
    'اتصل علي',
    'ليش ما اتصلوا علي',
    'المطعم ما حدا اتصل',
    'اتصل على مطعم',
    'رقم ٢',
    'تكلم عربي؟',
    'رحلتي على السعوديه رقم SV1020 متاخره ولا لا',
  ])('does not read "%s" as a call to a shop', (message) => {
    expect(keywordClassifyInContext(message, none).some((i) => i.kind === 'call')).toBe(false);
  });

  it('leaves "call them and order" to the order path — Rico sends orders itself', () => {
    expect(keywordClassifyInContext('اتصل على مطعم الماهر واطلب لي شاورما', none).some((i) => i.kind === 'call')).toBe(false);
  });

  it('validates a model answer: a name or a position, nothing else', () => {
    expect(validateIntent({ kind: 'call', placeName: ' مطعم الماهر ' })).toMatchObject({ kind: 'call', placeName: 'مطعم الماهر' });
    expect(validateIntent({ kind: 'call', referencedPosition: 3 })).toMatchObject({ kind: 'call', referencedPosition: 3, placeName: null });
    expect(validateIntent({ kind: 'call', placeName: '' })).toBeNull();
    expect(validateIntent({ kind: 'call' })).toBeNull();
    expect(validateIntent({ kind: 'call', placeName: 'x'.repeat(200) })).toBeNull();
  });
});
