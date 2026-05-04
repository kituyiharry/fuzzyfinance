import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/fuzzy_date.dart';

const _toothH = 11.0;
const _toothW = 18.0;

/// Hero tag helper — centralised so source and destination always match.
String itemHeroTag({required String type, required String id}) =>
    '$type-header-$id';

/// Used in both the home list (hasTornEdge: false, body: null) and the detail
/// page (hasTornEdge: true, body provided).  Header and body are part of the
/// same widget so the Hero transition is seamless — the torn edge is only
/// painted on the detail page.
class TornItemCard extends StatefulWidget {
  const TornItemCard({
    super.key,
    required this.label,
    required this.badgeLabel,
    required this.badgeColor,
    this.date,
    this.amount,
    this.status,
    this.showChevron = false,
    this.hasTornEdge = false,
    this.margin = EdgeInsets.zero,
    this.body,
    this.autoExpand = false,
    this.bodyPadding = const EdgeInsets.fromLTRB(20, 0, 20, 8),
  });

  final String label;
  final String badgeLabel;
  final Color badgeColor;
  final DateTime? date;
  final String? amount;

  /// Processing status shown as a small badge below the date in the header.
  final String? status;

  final bool showChevron;

  /// When false (list) a plain BoxDecoration is used — no jagged edge.
  /// When true (detail) the CustomPaint torn-edge painter is used.
  final bool hasTornEdge;

  final EdgeInsets margin;

  /// Body content.  Null on the list.
  final Widget? body;

  /// When true, body expands once the route transition completes.
  final bool autoExpand;

  /// Padding applied around the body content. Defaults to `fromLTRB(20,0,20,8)`.
  /// Pass `EdgeInsets.zero` when the body manages its own padding (e.g. tab bar).
  final EdgeInsets bodyPadding;

  @override
  State<TornItemCard> createState() => _TornItemCardState();
}

class _TornItemCardState extends State<TornItemCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _sizeAnim;
  late final Animation<double> _fadeAnim;
  bool _attachedToRoute = false;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 440),
    );
    _sizeAnim = CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic);
    _fadeAnim = CurvedAnimation(
      parent: _ctrl,
      curve: const Interval(0.15, 1.0, curve: Curves.easeIn),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (widget.autoExpand && widget.body != null && !_attachedToRoute) {
      final animation = ModalRoute.of(context)?.animation;
      if (animation != null) {
        _attachedToRoute = true;
        if (animation.status == AnimationStatus.completed) {
          _ctrl.forward();
        } else {
          void listener(AnimationStatus status) {
            if (status == AnimationStatus.completed) {
              animation.removeStatusListener(listener);
              if (mounted) _ctrl.forward();
            }
          }
          animation.addStatusListener(listener);
        }
      }
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  // ── Header row ─────────────────────────────────────────────────────────────

  Widget _buildHeader(
      BuildContext context, ThemeData theme, FuzzyThemeExtension ext) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Container(width: 6, height: 40, color: widget.badgeColor),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    color: widget.badgeColor.withValues(alpha: 0.12),
                    child: Text(
                      widget.badgeLabel,
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: widget.badgeColor,
                        fontSize: 9,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      widget.label,
                      style: theme.textTheme.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ]),
                if (widget.date != null || widget.status != null) ...[
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      if (widget.date != null)
                        Text(fuzzyDate(widget.date!),
                            style: theme.textTheme.bodySmall),
                      if (widget.date != null && widget.status != null)
                        const SizedBox(width: 6),
                      if (widget.status != null)
                        _StatusChip(status: widget.status!),
                    ],
                  ),
                ],
              ],
            ),
          ),
          if (widget.amount != null) ...[
            const SizedBox(width: 8),
            Text(
              widget.amount!,
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
          ],
          const SizedBox(width: 4),
          //if (widget.showChevron)
            //Icon(Icons.chevron_right, size: 16, color: ext.mutedFg),
        ],
      ),
    );
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    final hasBody = widget.body != null;
    final header = _buildHeader(context, theme, ext);

    if (!widget.hasTornEdge) {
      // ── List variant: plain bordered card, no jagged edge ────────────────
      return Container(
        margin: widget.margin,
        decoration: BoxDecoration(
          border: Border.all(color: ext.border, width: 2),
          boxShadow: [ext.cardShadow],
          color: theme.colorScheme.surface,
        ),
        child: header,
      );
    }

    // ── Detail variant: CustomPaint torn edge ─────────────────────────────
    return Container(
      margin: widget.margin,
      child: CustomPaint(
        painter: _TornEdgePainter(
          fillColor: theme.colorScheme.surface,
          borderColor: ext.border,
          shadowColor: ext.cardShadow.color,
        ),
        child: Padding(
          padding: EdgeInsets.only(bottom: _toothH + (hasBody ? 16 : 8)),
          // SingleChildScrollView to prevent Overflow errors when shrinking
          // during page transitions
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                header,
                if (hasBody)
                  ClipRect(
                    child: SizeTransition(
                      sizeFactor: _sizeAnim,
                      axisAlignment: -1.0,
                      child: FadeTransition(
                        opacity: _fadeAnim,
                        child: Padding(
                          padding: widget.bodyPadding,
                          child: widget.body!,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Small status chip shown in the header ─────────────────────────────────────

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final ext = context.fuzzy;
    final color = switch (status.toLowerCase()) {
      'complete' || 'completenosync' => ext.successColor,
      'failed' => ext.dangerColor,
      'staged' || 'pending' => ext.infoColor,
      _ => ext.mutedFg,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
      color: color.withValues(alpha: 0.12),
      child: Text(
        status.toUpperCase(),
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: color,
              fontSize: 8,
            ),
      ),
    );
  }
}

// ── Dashed divider (perforation line inside the detail card) ──────────────────

class ItemCardDivider extends StatelessWidget {
  const ItemCardDivider({super.key});

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
    canvas.drawPath(
        path.shift(const Offset(4, 4)), Paint()..color = shadowColor);
    canvas.drawPath(path, Paint()..color = fillColor);
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
      canvas.drawLine(
          Offset(x, 0), Offset((x + dashW).clamp(0, size.width), 0), paint);
      x += dashW + gap;
    }
  }

  @override
  bool shouldRepaint(_DashedLinePainter old) => old.color != color;
}
