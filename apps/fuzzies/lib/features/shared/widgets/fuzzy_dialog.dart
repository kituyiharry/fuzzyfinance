import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

Future<bool> showFuzzyConfirmDialog(
  BuildContext context, {
  required String message,
  String confirmLabel = 'CONFIRM',
  String cancelLabel = 'CANCEL',
  bool isDanger = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) => _FuzzyConfirmDialog(
      message: message,
      confirmLabel: confirmLabel,
      cancelLabel: cancelLabel,
      isDanger: isDanger,
    ),
  );
  return result ?? false;
}

class _FuzzyConfirmDialog extends StatelessWidget {
  const _FuzzyConfirmDialog({
    required this.message,
    required this.confirmLabel,
    required this.cancelLabel,
    required this.isDanger,
  });

  final String message;
  final String confirmLabel;
  final String cancelLabel;
  final bool isDanger;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    return Dialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      child: Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          border: Border.all(color: ext.border, width: 2),
          boxShadow: [ext.cardShadow],
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(message, style: theme.textTheme.bodyMedium),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: Text(cancelLabel),
                ),
                const SizedBox(width: 8),
                if (isDanger)
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: ext.dangerColor, width: 2),
                      foregroundColor: ext.dangerColor,
                    ),
                    onPressed: () => Navigator.pop(context, true),
                    child: Text(confirmLabel),
                  )
                else
                  ElevatedButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: Text(confirmLabel),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
