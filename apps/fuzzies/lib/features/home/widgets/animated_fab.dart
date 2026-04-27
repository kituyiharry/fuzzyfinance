import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/endpoints.dart';
import '../../../core/cache/local_cache.dart';
import '../../../core/theme/app_theme.dart';
import '../home_provider.dart';

enum _UploadKind { receiptFile, receiptCamera, saleFile, saleCamera }

class AnimatedFab extends ConsumerStatefulWidget {
  const AnimatedFab({super.key});

  @override
  ConsumerState<AnimatedFab> createState() => _AnimatedFabState();
}

class _AnimatedFabState extends ConsumerState<AnimatedFab>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _expand;
  bool _open = false;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
    );
    _expand = CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _toggle() {
    setState(() => _open = !_open);
    _open ? _ctrl.forward() : _ctrl.reverse();
  }

  Future<void> _handleUpload(_UploadKind kind) async {
    _toggle();
    final client = ref.read(apiClientProvider);
    final cache = LocalCache.instance;

    try {
      final (bytes, name, mime) = await _pickFile(kind);
      if (bytes == null) return;

      final isReceipt =
          kind == _UploadKind.receiptFile || kind == _UploadKind.receiptCamera;

      const maxBytes = 10 * 1024 * 1024;
      if (bytes.length > maxBytes) {
        _showSnack('File too large (max 10 MB)');
        return;
      }
      const allowedMimes = {
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
      };
      if (!allowedMimes.contains(mime)) {
        _showSnack('Unsupported file type');
        return;
      }

      final endpoint = isReceipt ? Endpoints.receipts : Endpoints.sales;
      final resp = await client.dio.post<Map<String, dynamic>>(
        endpoint,
        data: FormData.fromMap({
          'file': MultipartFile.fromBytes(
            bytes,
            filename: name,
            contentType: DioMediaType.parse(mime),
          ),
        }),
      );

      await cache.invalidate(isReceipt ? CacheKeys.receipts : CacheKeys.sales);
      ref.invalidate(isReceipt ? receiptsProvider : salesProvider);

      final id =
          resp.data?[isReceipt ? 'receiptId' : 'saleId'] as String?;
      if (id != null && mounted) {
        _showSnack('Uploaded — processing...');
      }
    } catch (e) {
      _showSnack('Upload failed: ${e.toString().split('\n').first}');
    }
  }

  Future<(List<int>?, String, String)> _pickFile(_UploadKind kind) async {
    if (kind == _UploadKind.receiptCamera ||
        kind == _UploadKind.saleCamera) {
      final picked =
          await ImagePicker().pickImage(source: ImageSource.camera);
      if (picked == null) return (null, '', '');
      return (await picked.readAsBytes(), picked.name, 'image/jpeg');
    } else {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
        withData: true,
      );
      if (result == null || result.files.single.bytes == null) {
        return (null, '', '');
      }
      final f = result.files.single;
      final mime =
          f.extension == 'pdf' ? 'application/pdf' : 'image/${f.extension}';
      return (f.bytes!.toList(), f.name, mime);
    }
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg.toUpperCase())));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    final actions = [
      _FabAction(
        icon: Icons.camera_alt,
        label: 'RECEIPT PHOTO',
        onTap: () => _handleUpload(_UploadKind.receiptCamera),
        color: ext.infoColor,
      ),
      _FabAction(
        icon: Icons.upload_file,
        label: 'RECEIPT FILE',
        onTap: () => _handleUpload(_UploadKind.receiptFile),
        color: ext.infoColor,
      ),
      _FabAction(
        icon: Icons.camera_enhance,
        label: 'SALE PHOTO',
        onTap: () => _handleUpload(_UploadKind.saleCamera),
        color: ext.successColor,
      ),
      _FabAction(
        icon: Icons.attach_money,
        label: 'SALE FILE',
        onTap: () => _handleUpload(_UploadKind.saleFile),
        color: ext.successColor,
      ),
    ];

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        ...actions.asMap().entries.map((entry) {
          final delay = entry.key / actions.length;
          return AnimatedBuilder(
            animation: _expand,
            builder: (_, child) {
              final t = (_expand.value - delay).clamp(0.0, 1.0) /
                  (1.0 - delay).clamp(0.001, 1.0);
              return Opacity(
                opacity: t,
                child: Transform.translate(
                  offset: Offset(0, (1 - t) * 20),
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_open)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            color: theme.colorScheme.surface,
                            child: Text(
                              entry.value.label,
                              style: theme.textTheme.labelLarge,
                            ),
                          ),
                        const SizedBox(width: 8),
                        FloatingActionButton.small(
                          heroTag: 'fab_${entry.key}',
                          backgroundColor: entry.value.color,
                          foregroundColor: theme.colorScheme.surface,
                          shape: const RoundedRectangleBorder(
                              borderRadius: BorderRadius.zero),
                          elevation: 0,
                          onPressed: entry.value.onTap,
                          child: Icon(entry.value.icon, size: 20),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        }),
        FloatingActionButton(
          heroTag: 'fab_main',
          backgroundColor: theme.colorScheme.primary,
          foregroundColor: theme.colorScheme.onPrimary,
          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
          elevation: 4,
          onPressed: _toggle,
          child: AnimatedRotation(
            turns: _open ? 0.125 : 0,
            duration: const Duration(milliseconds: 220),
            child: const Icon(Icons.add),
          ),
        ),
      ],
    );
  }
}

class _FabAction {
  const _FabAction({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.color,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color color;
}
