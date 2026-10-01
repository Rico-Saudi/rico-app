import 'package:flutter/material.dart';
import '../models/place_result.dart';
import '../services/favorites_service.dart';
import '../theme/app_theme.dart';
import '../widgets/place_result_card.dart';

class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  final FavoritesService _favoritesService = FavoritesService();
  List<PlaceResult>? _favorites;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final favorites = await _favoritesService.getAll();
    if (mounted) setState(() => _favorites = favorites);
  }

  @override
  Widget build(BuildContext context) {
    final favorites = _favorites;

    return Scaffold(
      backgroundColor: RicoColors.canvas,
      appBar: AppBar(
        title: const Text('المفضّلة'),
        shape: const Border(bottom: BorderSide(color: RicoColors.hairline)),
      ),
      body: favorites == null
          ? const Center(child: CircularProgressIndicator())
          : favorites.isEmpty
              ? const _EmptyFavorites()
              : RefreshIndicator(
                  color: RicoColors.primary,
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(14),
                    itemCount: favorites.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) => PlaceResultCard(
                      key: ValueKey(favorites[index].osmId),
                      place: favorites[index],
                      rank: index + 1,
                      // إزالة مكان من داخل بطاقته تُعيد تحميل القائمة، وإلا
                      // بقيت البطاقة معروضة وهي مشطوبة من المفضّلة أصلاً.
                      onFavoriteChanged: _load,
                    ),
                  ),
                ),
    );
  }
}

class _EmptyFavorites extends StatelessWidget {
  const _EmptyFavorites();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 66,
              height: 66,
              alignment: Alignment.center,
              decoration: const BoxDecoration(color: RicoColors.primaryTint, shape: BoxShape.circle),
              child: const Icon(Icons.bookmark_border_rounded, size: 30, color: RicoColors.primary),
            ),
            const SizedBox(height: 16),
            const Text('ما فيه أماكن محفوظة', style: RicoText.title),
            const SizedBox(height: 6),
            Text(
              'اضغط أيقونة الحفظ على أي نتيجة في المحادثة\nوتلقاها هنا في أي وقت.',
              textAlign: TextAlign.center,
              style: RicoText.body.copyWith(color: RicoColors.inkMuted),
            ),
            const SizedBox(height: 20),
            const SizedBox(width: 150, child: Divider(color: RicoColors.hairline)),
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.chat_bubble_outline_rounded, size: 17),
              label: const Text('رجوع للمحادثة'),
            ),
          ],
        ),
      ),
    );
  }
}
