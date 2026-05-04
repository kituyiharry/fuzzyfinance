import 'dart:math';
import 'dart:ui';
import 'package:flutter/material.dart';

class ActivitySplinePainter extends CustomPainter {
  const ActivitySplinePainter({
    required this.receiptCounts,
    required this.saleCounts,
    required this.receiptColor,
    required this.saleColor,
    required this.gridColor,
  });

  final List<double> receiptCounts;
  final List<double> saleCounts;
  final Color receiptColor;
  final Color saleColor;
  final Color gridColor;

  static List<Offset> _toPoints(List<double> counts, Size size) {
    final maxVal = counts.fold(0.0, max).clamp(1.0, double.infinity);
    final n = counts.length;
    return List.generate(
      n,
      (i) => Offset(
        i * size.width / (n - 1),
        size.height - (counts[i] / maxVal) * size.height * 0.78 - size.height * 0.08,
      ),
    );
  }

  void _drawSeries(Canvas canvas, Size size, List<double> counts, Color color) {
    if (counts.length < 2) return;
    final points = _toPoints(counts, size);
    final spline = CatmullRomSpline(points, tension: 0.0);
    final samples = spline.generateSamples(tolerance: 0.1).toList();
    if (samples.isEmpty) return;

    final linePath = Path()
      ..moveTo(samples.first.value.dx, samples.first.value.dy);
    for (final s in samples) {
      linePath.lineTo(s.value.dx, s.value.dy);
    }

    final fillPath = Path.from(linePath)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();

    canvas
      ..drawPath(
        fillPath,
        Paint()
          ..color = color.withValues(alpha: 0.10)
          ..style = PaintingStyle.fill,
      )
      ..drawPath(
        linePath,
        Paint()
          ..color = color
          ..strokeWidth = 1.5
          ..style = PaintingStyle.stroke,
      );

    final dotPaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    for (final p in points) {
      canvas.drawCircle(p, 2.0, dotPaint);
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()
      ..color = gridColor
      ..strokeWidth = 0.5;
    for (int i = 1; i < 4; i++) {
      final y = size.height * i / 4;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    _drawSeries(canvas, size, saleCounts, saleColor);
    _drawSeries(canvas, size, receiptCounts, receiptColor);
  }

  @override
  bool shouldRepaint(ActivitySplinePainter old) =>
      old.receiptCounts != receiptCounts ||
      old.saleCounts != saleCounts ||
      old.receiptColor != receiptColor ||
      old.saleColor != saleColor;
}
