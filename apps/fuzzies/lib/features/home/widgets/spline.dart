import 'dart:math';

import 'package:flutter/material.dart';
import 'dart:ui';

List<Offset> generateRandomPoints(Size size, int numPoints) {
  final random = Random(66);
  return List.generate(numPoints, (i) {
    return Offset(
      i * (size.width / (numPoints - 1)),
      random.nextDouble() * size.height,
    );
  });
}

class SplinePainter extends CustomPainter {
  final List<Offset> points;

  SplinePainter(this.points);

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) return;

    final paint = Paint()
      ..color = Colors.blue
      ..strokeWidth = 3.0
      ..style = PaintingStyle.stroke;

    // 1. Create the Spline
    // tension: 0.0 is the default (smoothest). 1.0 becomes linear.
    final spline = CatmullRomSpline(points, tension: 0.0);

    // 2. Generate points along the curve
    // generateSamples creates a list of Curve2DSample objects
    final samples = spline.generateSamples(tolerance: 0.1);

    final path = Path();
    if (samples.isNotEmpty) {
      path.moveTo(samples.first.value.dx, samples.first.value.dy);
      for (var sample in samples) {
        path.lineTo(sample.value.dx, sample.value.dy);
      }
    }

    canvas.drawPath(path, paint);

    // Optional: Draw the original control points for reference
    // final pointPaint = Paint()..color = Colors.red..strokeWidth = 8..strokeCap = StrokeCap.round;
    // canvas.drawPoints(PointMode.points, points, pointPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
