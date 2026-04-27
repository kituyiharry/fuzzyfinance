import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../models/timeline_item.dart';
import '../home_provider.dart';
import 'timeline_item_card.dart';

class SearchResultsRow extends ConsumerWidget {
  const SearchResultsRow({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(searchProvider);
    final theme = Theme.of(context);

    return state.when(
      loading: () => const SizedBox(
        height: 180,
        child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
      ),
      error: (e, _) => SizedBox(
        height: 48,
        child: Center(
          child: Text(
            'Search error',
            style: theme.textTheme.bodySmall,
          ),
        ),
      ),
      data: (items) {
        if (items.isEmpty) {
          return const SizedBox(
            height: 64,
            child: Center(child: Text('NO RESULTS', style: TextStyle(fontSize: 12))),
          );
        }
        return SizedBox(
          height: 180,
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            scrollDirection: Axis.horizontal,
            itemCount: items.length,
            itemBuilder: (ctx, i) {
              final item = items[i];
              return SearchResultCard(
                item: item,
                onTap: () {
                  if (item is ReceiptItem) {
                    context.push('/receipt/${item.id}');
                  } else if (item is SaleItem) {
                    context.push('/sale/${item.id}');
                  }
                },
              );
            },
          ),
        );
      },
    );
  }
}
