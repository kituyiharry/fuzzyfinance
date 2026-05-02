import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fuzzies/core/theme/app_theme.dart';
import 'package:fuzzies/features/home/widgets/info_tile.dart';


const double _kRemHeightBufferPadding = 8.0;
const double _kRemHeightTriggerSwitch = 48.0;
const double _kRemHeightRunAnimations = 56.0;

class AnimatedUploadLimit extends ConsumerStatefulWidget {

    final double remHeight;
    final bool  isShown;
    final bool  isAnimated;
    const AnimatedUploadLimit({super.key, required this.remHeight})
        : isShown    = remHeight > _kRemHeightTriggerSwitch, 
          isAnimated = remHeight > _kRemHeightRunAnimations
    ;

    @override
    ConsumerState<AnimatedUploadLimit> createState() {
        return _AnimatedUploadLimitState();
    }
}

class _AnimatedUploadLimitState extends ConsumerState<AnimatedUploadLimit> {

    @override
    Widget build(BuildContext context) {
        final ThemeData theme = Theme.of(context);
        return (widget.isShown ?
            TweenAnimationBuilder<Offset>(
                tween: Tween(
                    begin: Offset(0,-1), // : Offset(0, 0),
                    end:   Offset(0, 0), // : Offset(0,-1)
                ),
                duration: Duration(milliseconds: 200),
                curve: Curves.easeOutQuart, // Makes the "flying" feel smooth
                builder: (context, offset, child) {
                    return FractionalTranslation(
                        translation: offset,
                        child: child,
                    );
                },
                child: SizedBox(
                    key: ValueKey("bigger"),
                    height: widget.remHeight - _kRemHeightBufferPadding,
                    child: InfoTile(
                        child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal:8.0, vertical: 8.0),
                            child: Column( 
                                crossAxisAlignment: CrossAxisAlignment.center,
                                children: [ 
                                    Row(
                                      children: [
                                        Padding(
                                            padding: EdgeInsets.symmetric(horizontal: 4.0), 
                                            child: Text("LIMITS", textAlign: TextAlign.start, style: TextStyle(fontSize: 6)),
                                        ),
                                        Divider(color: theme.colorScheme.surface, height: 1),
                                      ],
                                    ),
                                    Expanded(
                                        child: Row( 
                                            children: [ 
                                                Padding(
                                                  padding: const EdgeInsets.symmetric(
                                                    horizontal: 4.0,
                                                  ),
                                                  child: Text("RECEIPTS", style: theme.textTheme.labelLarge?.copyWith(fontSize: 8.0)),
                                                ),
                                                Expanded(
                                                  child: TweenAnimationBuilder<double>(
                                                      duration: const Duration(milliseconds: 500),
                                                      curve: Curves.easeInOut,
                                                      tween: Tween<double>(begin: 0, end: 0.3), // currentProgress is 0.0 to 1.0
                                                      builder: (context, value, _) => (
                                                          Padding(
                                                            padding: const EdgeInsets.symmetric(horizontal: 8.0),
                                                            child: Center(
                                                              child: LinearProgressIndicator(
                                                                  color: theme.colorScheme.secondary,
                                                                  backgroundColor: theme.colorScheme.secondary.withAlpha(42),
                                                                  value: value
                                                              ),
                                                            ),
                                                          )
                                                )
                                                  ),
                                                ),
                                                Padding(
                                                  padding: const EdgeInsets.symmetric( 
                                                    horizontal: 8.0
                                                  ),
                                                  child: Text("0 / 30", style: theme.textTheme.labelLarge?.copyWith(fontSize: 8.0)),
                                                ),
                                            ]
                                        ),
                                    ),
                                    Expanded(
                                        child: Row( 
                                            children: [ 
                                                Padding(
                                                  padding: const EdgeInsets.only(
                                                    left: 4.0,
                                                    right: 19.0,
                                                  ),
                                                  child: Text("SALES", style: theme.textTheme.labelLarge?.copyWith(fontSize: 8.0)),
                                                ),
                                                Expanded(
                                                  child: TweenAnimationBuilder<double>(
                                                      duration: const Duration(milliseconds: 500),
                                                      curve: Curves.easeInOut,
                                                      tween: Tween<double>(begin: 0, end: 0.1), // currentProgress is 0.0 to 1.0
                                                      builder: (context, value, _) => 
                                                          Padding(
                                                            padding: const EdgeInsets.symmetric(horizontal: 6.0),
                                                            child: Center(
                                                              child: LinearProgressIndicator(
                                                                  color: theme.colorScheme.secondary,
                                                                  backgroundColor: theme.colorScheme.secondary.withAlpha(42),
                                                                  value: value
                                                              ),
                                                            ),
                                                          ),
                                                  ),
                                                ),
                                                Padding(
                                                  padding: const EdgeInsets.symmetric( 
                                                    horizontal: 8.0
                                                  ),
                                                  child: Text("0 / 30", style: theme.textTheme.labelLarge?.copyWith(fontSize: 8.0)),
                                                ),
                                            ]
                                        ),
                                    ),
                                ],
                            ),
                        ),
                    ),
                ),
            ) : SizedBox.shrink(key: ValueKey("shrink"))
        );
    }
}
