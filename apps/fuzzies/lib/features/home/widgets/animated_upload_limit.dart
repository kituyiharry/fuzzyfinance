import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fuzzies/core/theme/app_theme.dart';
import 'package:fuzzies/features/home/home_provider.dart';
import 'package:fuzzies/features/home/widgets/info_tile.dart';

const double _kRemHeightBufferPadding = 8.0;
const double _kRemHeightTriggerSwitch = 48.0;
const double _kRemHeightRunAnimations = 56.0;

class AnimatedUploadLimit extends ConsumerStatefulWidget {
  final double remHeight;
  final bool isShown;
  final bool isAnimated;

  const AnimatedUploadLimit({super.key, required this.remHeight})
      : isShown = remHeight > _kRemHeightTriggerSwitch,
        isAnimated = remHeight > _kRemHeightRunAnimations;

  @override
  ConsumerState<AnimatedUploadLimit> createState() =>
      _AnimatedUploadLimitState();
}

class _AnimatedUploadLimitState extends ConsumerState<AnimatedUploadLimit> {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    final limits = ref.watch(uploadLimitsProvider);

    final rPct = (limits.receiptsToday / limits.dailyLimit).clamp(0.0, 1.0);
    final sPct = (limits.salesToday / limits.dailyLimit).clamp(0.0, 1.0);
    final rColor = limits.receiptsNearLimit ? ext.warningColor : ext.infoColor;
    final sColor = limits.salesNearLimit ? ext.warningColor : ext.successColor;

    if (!widget.isShown) return const SizedBox.shrink(key: ValueKey('shrink'));

    return TweenAnimationBuilder<Offset>(
      tween: Tween(begin: const Offset(0, -1), end: Offset.zero),
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutQuart,
      builder: (context, offset, child) =>
          FractionalTranslation(translation: offset, child: child),
      child: SizedBox(
        key: const ValueKey('bigger'),
        height: widget.remHeight - _kRemHeightBufferPadding,
        child: InfoTile(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 8.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Row(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4.0),
                      child: Text(
                        'LIMITS',
                        textAlign: TextAlign.start,
                        style: theme.textTheme.labelLarge
                            ?.copyWith(fontSize: 6, color: ext.mutedFg),
                      ),
                    ),
                  ],
                ),
                Expanded(
                  child: Row(
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4.0),
                        child: Text(
                          'RECEIPTS',
                          style: theme.textTheme.labelLarge
                              ?.copyWith(fontSize: 8.0, color: rColor),
                        ),
                      ),
                      Expanded(
                        child: TweenAnimationBuilder<double>(
                          duration: const Duration(milliseconds: 500),
                          curve: Curves.easeInOut,
                          tween: Tween<double>(begin: 0, end: rPct),
                          builder: (context, value, _) => Padding(
                            padding:
                                const EdgeInsets.symmetric(horizontal: 8.0),
                            child: LinearProgressIndicator(
                              borderRadius: BorderRadius.zero,
                              color: rColor,
                              backgroundColor: rColor.withValues(alpha: 0.15),
                              value: value,
                            ),
                          ),
                        ),
                      ),
                      Padding(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 8.0),
                        child: Text(
                          '${limits.receiptsToday} / ${limits.dailyLimit}',
                          style: theme.textTheme.labelLarge
                              ?.copyWith(fontSize: 8.0, color: rColor),
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Row(
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(left: 4.0, right: 19.0),
                        child: Text(
                          'SALES',
                          style: theme.textTheme.labelLarge
                              ?.copyWith(fontSize: 8.0, color: sColor),
                        ),
                      ),
                      Expanded(
                        child: TweenAnimationBuilder<double>(
                          duration: const Duration(milliseconds: 500),
                          curve: Curves.easeInOut,
                          tween: Tween<double>(begin: 0, end: sPct),
                          builder: (context, value, _) => Padding(
                            padding:
                                const EdgeInsets.symmetric(horizontal: 6.0),
                            child: LinearProgressIndicator(
                              borderRadius: BorderRadius.zero,
                              color: sColor,
                              backgroundColor: sColor.withValues(alpha: 0.15),
                              value: value,
                            ),
                          ),
                        ),
                      ),
                      Padding(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 8.0),
                        child: Text(
                          '${limits.salesToday} / ${limits.dailyLimit}',
                          style: theme.textTheme.labelLarge
                              ?.copyWith(fontSize: 8.0, color: sColor),
                        ),
                      ),
                    ],
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
