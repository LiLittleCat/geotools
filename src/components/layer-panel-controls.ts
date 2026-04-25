export type TextareaToolId = 'copy' | 'clear' | 'expand';
export type FooterToolId = 'upload' | 'render';

export interface LayerPanelTool {
  id: TextareaToolId | FooterToolId;
  title: string;
  disabled: boolean;
}

interface BuildLayerPanelControlsOptions {
  autoRender: boolean;
  expanded: boolean;
  hasText: boolean;
  isLocked: boolean;
}

export function buildLayerPanelControls({
  autoRender,
  expanded,
  hasText,
  isLocked,
}: BuildLayerPanelControlsOptions) {
  const textareaTools: LayerPanelTool[] = [
    {
      id: 'copy',
      title: 'Copy to clipboard',
      disabled: !hasText,
    },
    {
      id: 'clear',
      title: 'Clear text',
      disabled: isLocked || !hasText,
    },
    {
      id: 'expand',
      title: expanded ? 'Collapse full text' : 'Expand full text',
      disabled: false,
    },
  ];

  const footerTools: LayerPanelTool[] = [
    {
      id: 'upload',
      title: 'Upload file',
      disabled: isLocked,
    },
  ];

  if (!autoRender && !isLocked) {
    footerTools.push({
      id: 'render',
      title: 'Render layer',
      disabled: false,
    });
  }

  return { textareaTools, footerTools };
}
