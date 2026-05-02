import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';

class InfoTile extends StatelessWidget {

    final Widget child;
    const InfoTile({super.key, required this.child});

    @override
    Widget build(BuildContext context) {
        final ext = context.fuzzy;
        final theme = Theme.of(context);
        return Container(
            margin: const EdgeInsets.all(4.0),
            decoration: BoxDecoration(
                border: Border.all(color: ext.border, width: 2),
                boxShadow: [ext.cardShadow],
                color: theme.colorScheme.surface,
            ),
            child: child,
        );
    }
}
