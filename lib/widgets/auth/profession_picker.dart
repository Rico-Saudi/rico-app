import 'package:flutter/material.dart';
import '../../models/profession.dart';
import '../../theme/app_theme.dart';

/// منتقي المهنة — شاشة بحث بأقسام، لا قائمة منسدلة.
///
/// القائمة تجاوزت المئة مهنة، وقائمة منسدلة بهذا الطول ما تُتصفّح: من يعرف
/// مهنته يكتب أول حرفين ويلقاها، ومن يستكشف يتصفّح قسمه (البناء، السيارات،
/// التقنية...). البحث يطابق الاسم واسم القسم معاً، فالكتابة "سيارات" تطلّع
/// كل مهن السيارات ولو ما كانت الكلمة في اسم المهنة نفسها.
Future<Profession?> showProfessionPicker(
  BuildContext context, {
  required List<Profession> professions,
  required List<ProfessionGroup> groups,
  String? selectedSlug,
}) {
  return showModalBottomSheet<Profession>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: RicoColors.ink.withValues(alpha: 0.42),
    builder: (_) => ProfessionPicker(
      professions: professions,
      groups: groups,
      selectedSlug: selectedSlug,
    ),
  );
}

class ProfessionPicker extends StatefulWidget {
  final List<Profession> professions;
  final List<ProfessionGroup> groups;
  final String? selectedSlug;

  const ProfessionPicker({
    super.key,
    required this.professions,
    required this.groups,
    this.selectedSlug,
  });

  @override
  State<ProfessionPicker> createState() => _ProfessionPickerState();
}

class _ProfessionPickerState extends State<ProfessionPicker> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  /// أقسام مطابقة للبحث، وكل قسم بمهنه المطابقة. الأقسام الفارغة تُحذف،
  /// فما يبقى في الشاشة عنوان بلا محتوى تحته.
  List<({ProfessionGroup group, List<Profession> professions})> get _sections {
    final query = _query.trim();
    final groups = widget.groups.isNotEmpty
        ? widget.groups
        // خادم بلا أقسام: قسم واحد بلا اسم يجمع الكل.
        : [const ProfessionGroup(slug: '', label: '')];

    final sections = <({ProfessionGroup group, List<Profession> professions})>[];
    for (final group in groups) {
      final matches = widget.professions.where((p) {
        if (widget.groups.isNotEmpty && p.group != group.slug) return false;
        if (query.isEmpty) return true;
        return p.label.contains(query) || group.label.contains(query);
      }).toList();
      if (matches.isNotEmpty) sections.add((group: group, professions: matches));
    }
    return sections;
  }

  @override
  Widget build(BuildContext context) {
    final sections = _sections;
    final total = sections.fold<int>(0, (sum, s) => sum + s.professions.length);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        // ارتفاع ثابت: القائمة طويلة أصلاً، وورقة تتمدد مع نتائج البحث
        // تقفز تحت إصبع المستخدم مع كل حرف.
        height: MediaQuery.sizeOf(context).height * 0.78,
        decoration: const BoxDecoration(
          color: RicoColors.canvas,
          borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            children: [
              const SizedBox(height: 10),
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                    color: RicoColors.hairlineStrong,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Text('اختر مهنتك', style: RicoText.display.copyWith(fontSize: 19)),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close_rounded, size: 20),
                      tooltip: 'إغلاق',
                      style: IconButton.styleFrom(foregroundColor: RicoColors.inkMuted),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
                child: TextField(
                  controller: _searchController,
                  autofocus: false,
                  textInputAction: TextInputAction.search,
                  style: RicoText.body.copyWith(color: RicoColors.ink),
                  onChanged: (value) => setState(() => _query = value),
                  decoration: InputDecoration(
                    hintText: 'دوّر عن مهنة… (مثل: دهان، تكييف، سيارات)',
                    prefixIcon: const Icon(Icons.search_rounded, size: 19),
                    suffixIcon: _query.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.clear_rounded, size: 18),
                            tooltip: 'مسح',
                            onPressed: () {
                              _searchController.clear();
                              setState(() => _query = '');
                            },
                          ),
                  ),
                ),
              ),
              Expanded(
                child: total == 0
                    ? _NoMatch(query: _query)
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(14, 0, 14, 16),
                        itemCount: sections.length,
                        itemBuilder: (context, index) {
                          final section = sections[index];
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (section.group.label.isNotEmpty)
                                Padding(
                                  padding: EdgeInsets.only(top: index == 0 ? 4 : 18, bottom: 8, left: 6, right: 6),
                                  child: Row(
                                    children: [
                                      Text(
                                        section.group.label,
                                        style: RicoText.caption.copyWith(fontWeight: FontWeight.w700),
                                      ),
                                      const SizedBox(width: 10),
                                      const Expanded(child: Divider(color: RicoColors.hairline)),
                                    ],
                                  ),
                                ),
                              Wrap(
                                spacing: 7,
                                runSpacing: 7,
                                children: [
                                  for (final profession in section.professions)
                                    _ProfessionChip(
                                      profession: profession,
                                      selected: profession.slug == widget.selectedSlug,
                                      onTap: () => Navigator.of(context).pop(profession),
                                    ),
                                ],
                              ),
                            ],
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfessionChip extends StatelessWidget {
  final Profession profession;
  final bool selected;
  final VoidCallback onTap;

  const _ProfessionChip({required this.profession, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? RicoColors.primaryTint : RicoColors.surface,
      borderRadius: RicoRadii.pillR,
      child: InkWell(
        onTap: onTap,
        borderRadius: RicoRadii.pillR,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: RicoRadii.pillR,
            border: Border.all(
              color: selected ? RicoColors.primary : RicoColors.hairline,
              width: selected ? 1.4 : 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (selected) ...[
                const Icon(Icons.check_rounded, size: 15, color: RicoColors.primary),
                const SizedBox(width: 6),
              ],
              Text(
                profession.label,
                style: RicoText.label.copyWith(
                  color: selected ? RicoColors.primaryDeep : RicoColors.inkBody,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NoMatch extends StatelessWidget {
  final String query;

  const _NoMatch({required this.query});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 40, 32, 32),
      child: Column(
        children: [
          const Icon(Icons.search_off_rounded, size: 42, color: RicoColors.inkFaint),
          const SizedBox(height: 14),
          Text('ما لقيت «$query»', style: RicoText.title, textAlign: TextAlign.center),
          const SizedBox(height: 7),
          Text(
            'جرّب كلمة أقصر، أو تصفّح الأقسام بمسح البحث.',
            style: RicoText.body.copyWith(height: 1.65),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
