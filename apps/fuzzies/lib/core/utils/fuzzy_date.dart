String fuzzyDate(DateTime dt) {
  final now = DateTime.now();
  final diff = now.difference(dt);

  if (diff.isNegative || diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) {
    final m = diff.inMinutes;
    return '$m ${m == 1 ? 'min' : 'mins'} ago';
  }
  if (diff.inHours < 24) {
    final h = diff.inHours;
    return '$h ${h == 1 ? 'hr' : 'hrs'} ago';
  }

  final todayMidnight = DateTime(now.year, now.month, now.day);
  final dtMidnight = DateTime(dt.year, dt.month, dt.day);
  final calendarDays = todayMidnight.difference(dtMidnight).inDays;

  if (calendarDays == 1) return 'yesterday';
  if (calendarDays < 7) return '$calendarDays days ago';
  if (calendarDays < 28) {
    final w = (calendarDays / 7).round().clamp(1, 3);
    return '$w ${w == 1 ? 'week' : 'weeks'} ago';
  }
  if (calendarDays < 365) {
    final mo = (calendarDays / 30.5).round().clamp(1, 11);
    return '$mo ${mo == 1 ? 'month' : 'months'} ago';
  }
  final y = (calendarDays / 365.25).round().clamp(1, 99);
  return '$y ${y == 1 ? 'year' : 'years'} ago';
}
