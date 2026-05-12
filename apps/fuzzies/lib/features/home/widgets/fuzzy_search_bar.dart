import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../home_provider.dart';

class FuzzySearchBar extends ConsumerStatefulWidget {
  const FuzzySearchBar({super.key, required this.onActiveChanged});

  final ValueChanged<bool> onActiveChanged;

  @override
  ConsumerState<FuzzySearchBar> createState() => _FuzzySearchBarState();
}

class _FuzzySearchBarState extends ConsumerState<FuzzySearchBar> {
  final _controller = TextEditingController();
  bool _active = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    final nowActive = value.trim().isNotEmpty;
    if (nowActive != _active) {
      setState(() => _active = nowActive);
      widget.onActiveChanged(nowActive);
    }
    ref.read(searchProvider.notifier).search(value);
  }

  void _clear() {
    _controller.clear();
    _onChanged('');
    FocusScope.of(context).unfocus();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: TextField(
        controller: _controller,
        onChanged: _onChanged,
        style: theme.textTheme.bodyMedium,
        decoration: InputDecoration(
          hintText: 'SEARCH EXPENSES & REVENUE',
          prefixIcon: Icon(Icons.search, size: 20, color: theme.colorScheme.onSurface),
          suffixIcon: _active
              ? IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: _clear,
                )
              : null,
        ),
      ),
    );
  }
}
