// validateIntent isn't exported (it's an internal of ClassifyService), so this
// exercises it the way the service does: through the module's own parsing of a
// model response. Kept to the order kind — the other kinds are covered by the
// prompt contract and by query-parser.spec.ts on the client side.
import { validateIntentForTest } from './classify.service';

describe('order intent validation', () => {
  const order = (over: Record<string, unknown> = {}) =>
    validateIntentForTest({
      kind: 'order',
      placeName: 'مطعم الماهر',
      orderItems: [{ name: 'كنافة نابلسية', quantity: 1 }],
      ...over,
    });

  it('accepts a shop with dishes', () => {
    const intent = order();
    expect(intent).toMatchObject({ kind: 'order', placeName: 'مطعم الماهر' });
    expect(intent!.orderItems).toEqual([{ name: 'كنافة نابلسية', quantity: 1 }]);
  });

  it('defaults a missing or silly quantity to one', () => {
    expect(order({ orderItems: [{ name: 'كنافة' }] })!.orderItems![0].quantity).toBe(1);
    expect(order({ orderItems: [{ name: 'كنافة', quantity: 0 }] })!.orderItems![0].quantity).toBe(1);
    expect(order({ orderItems: [{ name: 'كنافة', quantity: 5000 }] })!.orderItems![0].quantity).toBe(1);
    expect(order({ orderItems: [{ name: 'كنافة', quantity: 2.5 }] })!.orderItems![0].quantity).toBe(1);
  });

  it('keeps a real quantity', () => {
    expect(order({ orderItems: [{ name: 'كنافة', quantity: 3 }] })!.orderItems![0].quantity).toBe(3);
  });

  it('drops an order with no shop — there is nothing to open', () => {
    expect(order({ placeName: '' })).toBeNull();
    expect(order({ placeName: '   ' })).toBeNull();
    expect(order({ placeName: 'x'.repeat(200) })).toBeNull();
  });

  it('keeps a shop named without dishes, as a request to see its menu', () => {
    // "بدي أطلب من مطعم الماهر" — dropping this fell back to a generic
    // "nearest restaurant" search, which answers a question nobody asked.
    expect(order({ orderItems: [] })!.orderItems).toEqual([]);
    expect(order({ orderItems: 'كنافة' })!.orderItems).toEqual([]);
    expect(order({ orderItems: [{ name: '' }] })!.orderItems).toEqual([]);
    expect(order({ orderItems: [] })!.placeName).toBe('مطعم الماهر');
  });

  it('copies dish names verbatim rather than cleaning them up', () => {
    // The catalogue matcher is what handles spelling; this layer must not
    // "help" by rewriting what the customer said.
    expect(order({ orderItems: [{ name: 'كنافه نابلسيه' }] })!.orderItems![0].name).toBe('كنافه نابلسيه');
  });

  it('caps a runaway list', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ name: `صنف ${i}` }));
    expect(order({ orderItems: many })!.orderItems!.length).toBe(20);
  });
});
