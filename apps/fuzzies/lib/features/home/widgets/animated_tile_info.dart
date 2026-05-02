
import 'package:flutter/widgets.dart';
import 'package:fuzzies/features/home/widgets/info_tile.dart';

// The tile "slides in" from the top

class AnimatedTileInfo extends StatelessWidget {

    final double metrHeight;
    final Widget child;
    const AnimatedTileInfo({super.key, required this.metrHeight, required this.child});

    @override
    Widget build(BuildContext context) {
        return TweenAnimationBuilder<Offset>(
            tween: Tween(
                begin: Offset(0,-1), // From offscreen 
                end:   Offset(0, 0), // to current anchor
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
                height: metrHeight - 4.0,
                child: InfoTile( 
                    child: child
                )
            )
        );
    }

}
