import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../models/business_catalog.dart';
import '../models/cart.dart';
import '../models/customer.dart';
import '../models/request_flow.dart';
import '../services/auth_store.dart';
import '../theme/app_theme.dart';
import 'rico_surfaces.dart';

/// واجهة متجر المحل داخل المحادثة: تصفّح منتجاته بصورها، إضافة أكثر من منتج
/// لسلّة واحدة، ثم مراجعة وتأكيد طلب تواصل — بمراحله الثلاث مع مؤشر خطوات
/// في الترويسة، فيعرف المستخدم موضعه من التدفّق ولا يشعر أنه انتقل لشاشة
/// أخرى.
class CatalogFlowCard extends StatelessWidget {
  final RequestFlow flow;
  final CatalogFlowActions actions;

  const CatalogFlowCard({
    super.key,
    required this.flow,
    this.actions = const CatalogFlowActions(),
  });

  /// كم منتجاً يُعرض قبل "عرض الكل". ستة تملأ ثلاثة صفوف من عمودين — تكفي
  /// ليبان أنه متجر، ولا تبتلع المحادثة إن كان المحل بمئة صنف.
  static const int _previewCount = 6;

  @override
  Widget build(BuildContext context) {
    final submitted = flow.stage == RequestFlowStage.submitted;

    return RicoCard(
      padding: EdgeInsets.zero,
      accentBorder: submitted ? RicoColors.primaryTintStrong : RicoColors.hairline,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Header(flow: flow, submitted: submitted),
          Padding(
            padding: const EdgeInsets.all(14),
            child: switch (flow.stage) {
              RequestFlowStage.browsing => _Storefront(flow: flow, actions: actions, previewCount: _previewCount),
              RequestFlowStage.confirming || RequestFlowStage.submitting => _Review(flow: flow, actions: actions),
              RequestFlowStage.submitted => _Submitted(flow: flow),
            },
          ),
          // شريط السلّة ملتصق بأسفل البطاقة أثناء التصفّح فقط: الإجمالي وزر
          // المتابعة يبقيان تحت العين مهما طالت الشبكة فوقهما.
          if (flow.stage == RequestFlowStage.browsing && flow.cart.isNotEmpty)
            _CartBar(cart: flow.cart, onReview: actions.onReview),
        ],
      ),
    );
  }
}

/// تنسيق سعر: بلا كسور حين يكون صحيحاً، فـ«١٠ ر.س» أنظف من «١٠٫٠٠ ر.س».
String _money(double value) {
  final rounded = value.roundToDouble();
  return value == rounded ? rounded.toStringAsFixed(0) : value.toStringAsFixed(2);
}

class _Header extends StatelessWidget {
  final RequestFlow flow;
  final bool submitted;

  const _Header({required this.flow, required this.submitted});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: submitted ? RicoColors.primaryTint : RicoColors.surfaceSunken,
        border: const Border(bottom: BorderSide(color: RicoColors.hairline)),
      ),
      child: Row(
        children: [
          Icon(
            submitted ? Icons.task_alt_rounded : Icons.storefront_rounded,
            size: 16,
            color: submitted ? RicoColors.primary : RicoColors.inkMuted,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              flow.catalog.businessName,
              style: RicoText.labelStrong,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          _StageDots(stage: flow.stage),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- التصفّح

class _Storefront extends StatelessWidget {
  final RequestFlow flow;
  final CatalogFlowActions actions;
  final int previewCount;

  const _Storefront({required this.flow, required this.actions, required this.previewCount});

  @override
  Widget build(BuildContext context) {
    final catalog = flow.catalog;
    final visible = flow.visibleProducts;
    final shown = flow.showAllProducts ? visible : visible.take(previewCount).toList();
    final hidden = visible.length - shown.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (catalog.deals.isNotEmpty) ...[
          const RicoSectionLabel(label: 'العروض', icon: Icons.local_offer_rounded),
          for (final deal in catalog.deals)
            _DealRow(
              deal: deal,
              quantity: flow.cart.quantityOf('deal', deal.id),
              onAdd: () => actions.onAddDeal?.call(deal),
              onSetQuantity: (q) => actions.onSetQuantity?.call('deal', deal.id, q),
            ),
          if (catalog.products.isNotEmpty) const SizedBox(height: 14),
        ],
        if (catalog.products.isNotEmpty) ...[
          const RicoSectionLabel(label: 'المنتجات', icon: Icons.shopping_bag_rounded),
          // صفّ الفئات يظهر فقط حين تتعدّد — مرشِّح لا يفلتر شيئاً ضوضاء.
          if (catalog.categories.length > 1)
            _CategoryStrip(
              categories: catalog.categories,
              active: flow.activeCategory,
              onSelect: actions.onSelectCategory,
            ),
          if (shown.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 14),
              child: Text('ما فيه منتجات في هذي الفئة.', style: RicoText.caption, textAlign: TextAlign.center),
            )
          else
            _ProductGrid(products: shown, cart: flow.cart, actions: actions),
          if (hidden > 0 || flow.showAllProducts)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: OutlinedButton(
                onPressed: actions.onToggleShowAll,
                child: Text(flow.showAllProducts ? 'عرض أقل' : 'عرض كل المنتجات ($hidden أكثر)'),
              ),
            ),
        ],
      ],
    );
  }
}

/// شبكة المنتجات — عمودان بارتفاع محسوب من عرض البطاقة لا بنسبة ثابتة:
/// النسبة الثابتة تفيض على الشاشات الضيقة حين يلتف اسم المنتج لسطرين.
class _ProductGrid extends StatelessWidget {
  final List<CatalogProduct> products;
  final Cart cart;
  final CatalogFlowActions actions;

  const _ProductGrid({required this.products, required this.cart, required this.actions});

  /// ما تحت الصورة المربعة: الاسم سطران، السعر، وزر الإضافة.
  static const double _detailsHeight = 112;
  static const double _gap = 9;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final tileWidth = (constraints.maxWidth - _gap) / 2;
        return GridView.builder(
          padding: const EdgeInsets.only(top: 10),
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: products.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: _gap,
            crossAxisSpacing: _gap,
            mainAxisExtent: tileWidth + _detailsHeight,
          ),
          itemBuilder: (context, i) {
            final product = products[i];
            return _ProductTile(
              product: product,
              quantity: cart.quantityOf('product', product.id),
              onAdd: () => actions.onAddProduct?.call(product),
              onSetQuantity: (q) => actions.onSetQuantity?.call('product', product.id, q),
            );
          },
        );
      },
    );
  }
}

class _ProductTile extends StatelessWidget {
  final CatalogProduct product;
  final int quantity;
  final VoidCallback onAdd;
  final ValueChanged<int> onSetQuantity;

  const _ProductTile({
    required this.product,
    required this.quantity,
    required this.onAdd,
    required this.onSetQuantity,
  });

  @override
  Widget build(BuildContext context) {
    final inCart = quantity > 0;

    return Container(
      decoration: BoxDecoration(
        color: RicoColors.surface,
        borderRadius: RicoRadii.controlR,
        // الحافة الخضراء وحدها تكفي لتمييز ما في السلّة دون تلوين البطاقة.
        border: Border.all(color: inCart ? RicoColors.primary : RicoColors.hairline, width: inCart ? 1.4 : 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(RicoRadii.control)),
            child: AspectRatio(
              aspectRatio: 1,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _ProductImage(url: product.imageUrl),
                  if (product.hasDiscount)
                    PositionedDirectional(
                      top: 6,
                      start: 6,
                      child: _DiscountBadge(price: product.price, finalPrice: product.finalPrice),
                    ),
                ],
              ),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(9, 8, 9, 9),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      product.name,
                      style: RicoText.label.copyWith(fontWeight: FontWeight.w600, color: RicoColors.ink, height: 1.35),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '${_money(product.finalPrice)} ر.س',
                        style: RicoText.labelStrong.copyWith(color: RicoColors.primaryDeep),
                      ),
                      if (product.hasDiscount) ...[
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(
                            _money(product.price),
                            style: RicoText.caption.copyWith(
                              color: RicoColors.inkFaint,
                              decoration: TextDecoration.lineThrough,
                              fontSize: 11,
                            ),
                            maxLines: 1,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 7),
                  SizedBox(
                    height: 32,
                    child: inCart
                        ? _QuantityStepper(quantity: quantity, onChanged: onSetQuantity)
                        : _AddButton(onPressed: onAdd),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// صورة المنتج — رمز حقيبة على أرضية غائرة هو حالةُ التحميل وحالةُ "بلا صورة"
/// وحالةُ الفشل معاً، فلا يمرّ المستخدم على مربع رمادي فاضٍ ولا يبدو المنتج
/// بلا صورة معطوباً.
class _ProductImage extends StatelessWidget {
  final String? url;

  const _ProductImage({required this.url});

  @override
  Widget build(BuildContext context) {
    if (url == null) return const _ImageFallback();
    return CachedNetworkImage(
      imageUrl: url!,
      fit: BoxFit.cover,
      fadeInDuration: const Duration(milliseconds: 200),
      // نفكّ الترميز بعرض العرض لا بعرض الأصل: عشرون صورة بحجمها الكامل في
      // شبكة واحدة تأكل ذاكرة بلا فائدة بصرية.
      memCacheWidth: 400,
      placeholder: (_, __) => const _ImageFallback(),
      errorWidget: (_, __, ___) => const _ImageFallback(),
    );
  }
}

class _ImageFallback extends StatelessWidget {
  const _ImageFallback();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: RicoColors.surfaceSunken,
      child: Center(child: Icon(Icons.shopping_bag_outlined, size: 26, color: RicoColors.inkFaint)),
    );
  }
}

class _DiscountBadge extends StatelessWidget {
  final double price;
  final double finalPrice;

  const _DiscountBadge({required this.price, required this.finalPrice});

  @override
  Widget build(BuildContext context) {
    final off = ((price - finalPrice) / price * 100).round();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: const BoxDecoration(color: RicoColors.danger, borderRadius: RicoRadii.pillR),
      child: Text(
        'خصم $off٪',
        style: RicoText.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 10),
      ),
    );
  }
}

class _AddButton extends StatelessWidget {
  final VoidCallback onPressed;

  const _AddButton({required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: RicoColors.primaryTint,
      borderRadius: RicoRadii.controlR,
      child: InkWell(
        onTap: onPressed,
        borderRadius: RicoRadii.controlR,
        child: Center(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.add_rounded, size: 16, color: RicoColors.primaryDeep),
              const SizedBox(width: 4),
              Text('أضف', style: RicoText.caption.copyWith(color: RicoColors.primaryDeep, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      ),
    );
  }
}

/// − العدد + . النقص عند ١ يحذف السطر (سلّة تقبل صفراً من صنف ليست سلّة)،
/// فتتبدّل أيقونته لسلّة مهملات ليكون الأثر ظاهراً قبل الضغط.
class _QuantityStepper extends StatelessWidget {
  final int quantity;
  final ValueChanged<int> onChanged;
  final bool compact;

  const _QuantityStepper({required this.quantity, required this.onChanged, this.compact = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: RicoColors.primary, borderRadius: RicoRadii.controlR),
      padding: EdgeInsets.symmetric(horizontal: compact ? 2 : 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _StepperButton(
            icon: quantity == 1 ? Icons.delete_outline_rounded : Icons.remove_rounded,
            tooltip: quantity == 1 ? 'احذف' : 'أنقص',
            onTap: () => onChanged(quantity - 1),
          ),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: compact ? 6 : 4),
            child: Text(
              '$quantity',
              style: RicoText.labelStrong.copyWith(color: RicoColors.onPrimary),
            ),
          ),
          _StepperButton(
            icon: Icons.add_rounded,
            tooltip: 'زد',
            // ٩٩ هو سقف الخادم أيضاً؛ تعطيل الزر أوضح من رفض صامت.
            onTap: quantity >= 99 ? null : () => onChanged(quantity + 1),
          ),
        ],
      ),
    );
  }
}

class _StepperButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;

  const _StepperButton({required this.icon, required this.tooltip, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkResponse(
        onTap: onTap,
        radius: 18,
        child: Padding(
          padding: const EdgeInsets.all(5),
          child: Icon(
            icon,
            size: 16,
            color: onTap == null ? RicoColors.onPrimary.withValues(alpha: 0.4) : RicoColors.onPrimary,
          ),
        ),
      ),
    );
  }
}

class _CategoryStrip extends StatelessWidget {
  final List<String> categories;
  final String? active;
  final void Function(String? category)? onSelect;

  const _CategoryStrip({required this.categories, required this.active, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 34,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.only(top: 8),
        children: [
          _CategoryChip(label: 'الكل', selected: active == null, onTap: () => onSelect?.call(null)),
          for (final category in categories)
            _CategoryChip(
              label: category,
              selected: active == category,
              onTap: () => onSelect?.call(category),
            ),
        ],
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _CategoryChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 6),
      child: Material(
        color: selected ? RicoColors.primary : RicoColors.surfaceSunken,
        borderRadius: RicoRadii.pillR,
        child: InkWell(
          onTap: onTap,
          borderRadius: RicoRadii.pillR,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            child: Text(
              label,
              style: RicoText.caption.copyWith(
                color: selected ? RicoColors.onPrimary : RicoColors.inkBody,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DealRow extends StatelessWidget {
  final CatalogDeal deal;
  final int quantity;
  final VoidCallback onAdd;
  final ValueChanged<int> onSetQuantity;

  const _DealRow({
    required this.deal,
    required this.quantity,
    required this.onAdd,
    required this.onSetQuantity,
  });

  @override
  Widget build(BuildContext context) {
    final inCart = quantity > 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 7),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
        decoration: BoxDecoration(
          color: RicoColors.goldTint,
          borderRadius: RicoRadii.controlR,
          border: Border.all(color: inCart ? RicoColors.gold : Colors.transparent),
        ),
        child: Row(
          children: [
            Container(
              width: 30,
              height: 30,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: RicoColors.surface, borderRadius: BorderRadius.circular(9)),
              child: const Icon(Icons.local_offer_rounded, size: 15, color: RicoColors.goldInk),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    deal.titleAr,
                    style: RicoText.label.copyWith(fontWeight: FontWeight.w600, color: RicoColors.ink),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(deal.typeLabel, style: RicoText.caption.copyWith(color: RicoColors.goldInk)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              height: 30,
              child: inCart
                  ? _QuantityStepper(quantity: quantity, onChanged: onSetQuantity, compact: true)
                  : SizedBox(width: 64, child: _AddButton(onPressed: onAdd)),
            ),
          ],
        ),
      ),
    );
  }
}

/// شريط السلّة أسفل البطاقة: العدد والإجمالي وزر المتابعة.
class _CartBar extends StatelessWidget {
  final Cart cart;
  final VoidCallback? onReview;

  const _CartBar({required this.cart, required this.onReview});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      decoration: const BoxDecoration(
        color: RicoColors.surfaceSunken,
        border: Border(top: BorderSide(color: RicoColors.hairline)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${cart.itemCount} ${_pieces(cart.itemCount)}', style: RicoText.caption),
                const SizedBox(height: 1),
                Text('${_money(cart.total)} ر.س', style: RicoText.cardTitle.copyWith(color: RicoColors.primaryDeep)),
              ],
            ),
          ),
          ElevatedButton.icon(
            onPressed: onReview,
            icon: const Icon(Icons.shopping_cart_checkout_rounded, size: 17),
            label: const Text('مراجعة الطلب'),
          ),
        ],
      ),
    );
  }
}

/// العربية تجمع جمع قلة لما دون العشرة وتفرد التمييز بعدها — «٣ قطع» و«١٢ قطعة».
String _pieces(int count) {
  if (count == 1) return 'قطعة';
  if (count == 2) return 'قطعتان';
  if (count <= 10) return 'قطع';
  return 'قطعة';
}

// --------------------------------------------------------------- المراجعة

/// خطوة المراجعة — السلّة كاملة قابلة للتعديل، ثم بيانات الحساب. الاستماع
/// لـ[AuthStore] هنا لا في الشاشة يجعل البطاقة تتحدّث لحظة نجاح الدخول من
/// الورقة السفلية بلا تمرير حالة.
class _Review extends StatelessWidget {
  final RequestFlow flow;
  final CatalogFlowActions actions;

  const _Review({required this.flow, required this.actions});

  @override
  Widget build(BuildContext context) {
    final submitting = flow.stage == RequestFlowStage.submitting;

    return ListenableBuilder(
      listenable: AuthStore.instance,
      builder: (context, _) {
        final customer = AuthStore.instance.customer;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final line in flow.cart.lines)
              _CartLineRow(
                line: line,
                // التعديل يُقفل أثناء الإرسال: تغيير السلّة ونحن نرسلها يخلق
                // فرقاً بين ما يراه المستخدم وما يصل المحل.
                onSetQuantity: submitting
                    ? null
                    : (q) => actions.onSetQuantity?.call(line.itemType, line.itemId, q),
              ),
            const SizedBox(height: 4),
            _TotalRow(cart: flow.cart),
            const SizedBox(height: 12),
            if (customer != null) _AccountRecap(customer: customer) else const _SignInInvite(),
            if (flow.errorMessage != null) ...[
              const SizedBox(height: 10),
              _CardError(message: flow.errorMessage!),
            ],
            const SizedBox(height: 13),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: submitting ? null : actions.onBack,
                    child: const Text('أضف غيره'),
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  flex: 2,
                  child: ElevatedButton.icon(
                    onPressed: submitting ? null : (customer != null ? actions.onConfirm : actions.onRequestLogin),
                    icon: submitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : Icon(customer != null ? Icons.send_rounded : Icons.lock_open_rounded, size: 17),
                    label: Text(
                      submitting
                          ? 'جارٍ الإرسال…'
                          : customer != null
                              ? 'أكّد الطلب'
                              : 'سجّل دخولك وأكّد',
                    ),
                  ),
                ),
              ],
            ),
          ],
        );
      },
    );
  }
}

class _CartLineRow extends StatelessWidget {
  final CartLine line;
  final ValueChanged<int>? onSetQuantity;

  const _CartLineRow({required this.line, required this.onSetQuantity});

  @override
  Widget build(BuildContext context) {
    final isDeal = line.itemType == 'deal';

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(9),
            child: SizedBox(
              width: 44,
              height: 44,
              child: isDeal
                  ? const ColoredBox(
                      color: RicoColors.goldTint,
                      child: Icon(Icons.local_offer_rounded, size: 18, color: RicoColors.goldInk),
                    )
                  : _ProductImage(url: line.imageUrl),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.label,
                  style: RicoText.label.copyWith(fontWeight: FontWeight.w600, color: RicoColors.ink),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  // مجموع السطر لا سعر الوحدة: هو ما سيدفعه فعلاً عن هذا الصنف.
                  line.unitPrice == null ? (line.detail ?? '') : '${_money(line.lineTotal)} ر.س',
                  style: RicoText.caption.copyWith(color: isDeal ? RicoColors.goldInk : RicoColors.primaryDeep),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (onSetQuantity != null)
            SizedBox(height: 30, child: _QuantityStepper(quantity: line.quantity, onChanged: onSetQuantity!, compact: true))
          else
            Text('×${line.quantity}', style: RicoText.labelStrong),
        ],
      ),
    );
  }
}

class _TotalRow extends StatelessWidget {
  final Cart cart;

  const _TotalRow({required this.cart});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: const BoxDecoration(
        color: RicoColors.surfaceSunken,
        borderRadius: RicoRadii.controlR,
      ),
      child: Column(
        children: [
          Row(
            children: [
              const Expanded(child: Text('الإجمالي', style: RicoText.labelStrong)),
              Text('${_money(cart.total)} ر.س', style: RicoText.cardTitle.copyWith(color: RicoColors.primaryDeep)),
            ],
          ),
          // العرض بلا سعر مفرد، فلا يدخل الإجمالي — قولها هنا أصدق من رقم
          // يبدو نهائياً ثم يفاجئه المحل بغيره.
          if (cart.hasUnpricedLine)
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Row(
                children: [
                  Icon(Icons.info_outline_rounded, size: 13, color: RicoColors.inkMuted),
                  SizedBox(width: 6),
                  Expanded(
                    child: Text('قيمة العروض يحسبها المحل عند التواصل.', style: RicoText.caption),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ----------------------------------------------------------------- النجاح

class _Submitted extends StatelessWidget {
  final RequestFlow flow;

  const _Submitted({required this.flow});

  @override
  Widget build(BuildContext context) {
    final cart = flow.cart;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: const BoxDecoration(color: RicoColors.primaryTint, shape: BoxShape.circle),
              child: const Icon(Icons.check_rounded, size: 19, color: RicoColors.primary),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('تم إرسال طلبك', style: RicoText.cardTitle),
                  const SizedBox(height: 3),
                  Text(
                    '${flow.catalog.businessName} يتواصل معك قريباً على ${flow.customerPhone ?? ""}.',
                    style: RicoText.caption.copyWith(height: 1.6),
                  ),
                ],
              ),
            ),
          ],
        ),
        if (cart.isNotEmpty) ...[
          const SizedBox(height: 12),
          // ملخّص ما طُلب يبقى في المحادثة: بعد أيام يعود المستخدم للرسالة
          // ليتذكّر ما طلبه من هذا المحل بالضبط.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: const BoxDecoration(
              color: RicoColors.surfaceSunken,
              borderRadius: RicoRadii.controlR,
            ),
            child: Column(
              children: [
                for (final line in cart.lines)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 5),
                    child: Row(
                      children: [
                        Text('×${line.quantity}', style: RicoText.caption.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            line.label,
                            style: RicoText.caption.copyWith(color: RicoColors.inkBody),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (line.unitPrice != null)
                          Text('${_money(line.lineTotal)} ر.س', style: RicoText.caption),
                      ],
                    ),
                  ),
                if (cart.total > 0) ...[
                  const Divider(height: 11, color: RicoColors.hairline),
                  Row(
                    children: [
                      const Expanded(child: Text('الإجمالي', style: RicoText.labelStrong)),
                      Text(
                        '${_money(cart.total)} ر.س',
                        style: RicoText.labelStrong.copyWith(color: RicoColors.primaryDeep),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

// ------------------------------------------------------------ عناصر مشتركة

/// بيانات الحساب التي ستصل للمحل — تُعرض ولا تُكتب: بعد ربط الطلب بالحساب
/// صار الاسم والرقم موثّقين مرة واحدة عند التسجيل بدل كتابتهما (وإمكان
/// خطئهما) مع كل طلب.
class _AccountRecap extends StatelessWidget {
  final Customer customer;

  const _AccountRecap({required this.customer});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RicoColors.primaryTint,
        borderRadius: RicoRadii.controlR,
        border: Border.all(color: RicoColors.primaryTintStrong),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.verified_user_rounded, size: 16, color: RicoColors.primary),
              SizedBox(width: 8),
              Expanded(
                child: Text('يوصل المحل باسمك ورقمك', style: RicoText.labelStrong),
              ),
            ],
          ),
          const SizedBox(height: 9),
          _RecapRow(icon: Icons.person_outline_rounded, value: customer.name),
          const SizedBox(height: 5),
          _RecapRow(icon: Icons.phone_outlined, value: customer.phone, ltr: true),
        ],
      ),
    );
  }
}

class _RecapRow extends StatelessWidget {
  final IconData icon;
  final String value;
  final bool ltr;

  const _RecapRow({required this.icon, required this.value, this.ltr = false});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 14, color: RicoColors.primaryDeep),
        const SizedBox(width: 7),
        Expanded(
          child: Text(
            value,
            // الأرقام تُقرأ من اليسار حتى داخل واجهة عربية.
            textDirection: ltr ? TextDirection.ltr : null,
            textAlign: TextAlign.start,
            style: RicoText.caption.copyWith(color: RicoColors.primaryDeep, fontWeight: FontWeight.w600),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

/// دعوة الدخول للزائر — تشرح السبب قبل الزر: طلب حساب بلا سبب ظاهر أسرع
/// طريق لهجر التدفّق عند آخر خطوة فيه.
class _SignInInvite extends StatelessWidget {
  const _SignInInvite();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RicoColors.goldTint,
        borderRadius: RicoRadii.controlR,
        border: Border.all(color: RicoColors.gold.withValues(alpha: 0.28)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.lock_outline_rounded, size: 17, color: RicoColors.goldInk),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('يحتاج حساب عشان نوصّل طلبك', style: RicoText.labelStrong),
                const SizedBox(height: 3),
                Text(
                  'المحل يتواصل معك على رقمك، فنتأكد منه مرة وحدة بس — ودقيقة وتخلص.',
                  style: RicoText.caption.copyWith(height: 1.6),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CardError extends StatelessWidget {
  final String message;

  const _CardError({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: const BoxDecoration(
        color: RicoColors.dangerTint,
        borderRadius: RicoRadii.controlR,
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, size: 16, color: RicoColors.danger),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message, style: RicoText.caption.copyWith(color: RicoColors.danger)),
          ),
        ],
      ),
    );
  }
}

/// مؤشر مرحلة التدفّق — ثلاث شُرَط تمتلئ بالتقدّم، أوضح من رقم أو نص.
class _StageDots extends StatelessWidget {
  final RequestFlowStage stage;

  const _StageDots({required this.stage});

  int get _index => switch (stage) {
        RequestFlowStage.browsing => 0,
        RequestFlowStage.confirming || RequestFlowStage.submitting => 1,
        RequestFlowStage.submitted => 2,
      };

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 3; i++)
          Container(
            width: i == _index ? 14 : 6,
            height: 4,
            margin: const EdgeInsets.only(right: 3),
            decoration: BoxDecoration(
              color: i <= _index ? RicoColors.primary : RicoColors.hairlineStrong,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
      ],
    );
  }
}
