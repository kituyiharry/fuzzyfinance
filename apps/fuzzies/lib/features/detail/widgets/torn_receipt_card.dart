import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

// Tooth dimensions for the torn edge.
const _toothH = 11.0;
const _toothW = 18.0;

/// A card styled as a thermal receipt torn from a printer.
/// The bottom edge is rendered as a jagged zigzag via [CustomPaint].
/// Wrap the receipt content with this widget; it handles all internal padding.
class TornReceiptCard extends StatelessWidget {
  const TornReceiptCard({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    return CustomPaint(
      painter: _TornEdgePainter(
        fillColor: theme.colorScheme.surface,
        borderColor: ext.border,
        shadowColor: ext.cardShadow.color,
      ),
      child: Padding(
        // Extra bottom padding so content clears the torn teeth.
        padding: const EdgeInsets.only(
          top: 20,
          left: 20,
          right: 20,
          bottom: _toothH + 14,
        ),
        child: child,
      ),
    );
  }
}

/// A dashed horizontal rule — mimics the cut/perforation line on a receipt.
class ReceiptDivider extends StatelessWidget {
  const ReceiptDivider({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: CustomPaint(
        size: const Size(double.infinity, 1),
        painter: _DashedLinePainter(color: context.fuzzy.borderSubtle),
      ),
    );
  }
}

// ── Painters ──────────────────────────────────────────────────────────────────

class _TornEdgePainter extends CustomPainter {
  const _TornEdgePainter({
    required this.fillColor,
    required this.borderColor,
    required this.shadowColor,
  });

  final Color fillColor;
  final Color borderColor;
  final Color shadowColor;

  Path _buildPath(Size size) {
    final bodyH = size.height - _toothH;
    final count = (size.width / _toothW).round().clamp(1, 9999);
    final tw = size.width / count;

    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width, bodyH);

    // Traverse right-to-left; each tooth tip points downward.
    for (int i = count - 1; i >= 0; i--) {
      final baseX = i * tw;
      path
        ..lineTo(baseX + tw / 2, bodyH + _toothH)
        ..lineTo(baseX, bodyH);
    }

    return path..close();
  }

  @override
  void paint(Canvas canvas, Size size) {
    final path = _buildPath(size);

    // Hard offset shadow — matches the rest of the app (4 px, no blur).
    canvas.drawPath(
      path.shift(const Offset(4, 4)),
      Paint()..color = shadowColor,
    );

    // Fill.
    canvas.drawPath(path, Paint()..color = fillColor);

    // Border stroke.
    canvas.drawPath(
      path,
      Paint()
        ..color = borderColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );
  }

  @override
  bool shouldRepaint(_TornEdgePainter old) =>
      old.fillColor != fillColor ||
      old.borderColor != borderColor ||
      old.shadowColor != shadowColor;
}

class _DashedLinePainter extends CustomPainter {
  const _DashedLinePainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const dashW = 6.0;
    const gap = 5.0;
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;

    double x = 0;
    while (x < size.width) {
      canvas.drawLine(Offset(x, 0), Offset((x + dashW).clamp(0, size.width), 0), paint);
      x += dashW + gap;
    }
  }

  @override
  bool shouldRepaint(_DashedLinePainter old) => old.color != color;
}
