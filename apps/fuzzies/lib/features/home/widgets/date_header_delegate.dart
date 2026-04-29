import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class DateHeaderDelegate extends SliverPersistentHeaderDelegate {
  DateHeaderDelegate(this.date);
  final DateTime date;

  static const _height = 36.0;
  static final _fmt = DateFormat('EEEE, MMMM d');

  @override
  double get minExtent => _height;
  @override
  double get maxExtent => _height;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    final theme = Theme.of(context);
    return Container(
      height: _height,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      alignment: Alignment.centerLeft,
      decoration: BoxDecoration( 
        color: theme.scaffoldBackgroundColor,
        border: BoxBorder.fromLTRB(
            bottom: BorderSide(color: theme.colorScheme.primary), 
        )
      ),
      child: Row(
        children: [
          Text(
            _fmt.format(date).toUpperCase(),
            style: theme.textTheme.labelLarge,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Divider(
              color: theme.dividerColor,
              thickness: 1,
            ),
          ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(DateHeaderDelegate old) => old.date != date;
}
