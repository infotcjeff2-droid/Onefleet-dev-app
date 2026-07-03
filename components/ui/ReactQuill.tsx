import { useState, useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import { View, StyleSheet, Dimensions, Platform, ActivityIndicator, Text } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useThemeStore } from '@/store/themeStore';
import { colors, borderRadius, spacing } from '@/constants/theme';

interface ReactQuillProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  minHeight?: number;
}

export interface ReactQuillRef {
  getHtml: () => Promise<string>;
  getText: () => Promise<string>;
  blur: () => void;
  focus: () => void;
}

// HTML template for the rich text editor
const getEditorHtml = (theme: 'light' | 'dark', placeholder: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link href="https://cdn.quilljs.com/1.3.7/quill.snow.css" rel="stylesheet">
  <script src="https://cdn.quilljs.com/1.3.7/quill.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      ${theme === 'dark' ? `
        background-color: #1a1a1a;
        color: #ffffff;
      ` : `
        background-color: #ffffff;
        color: #000000;
      `}
    }
    #editor-container {
      height: calc(100% - 42px);
      overflow-y: auto;
      padding: 12px;
      -webkit-overflow-scrolling: touch;
    }
    .ql-toolbar {
      ${theme === 'dark' ? `
        background: #2a2a2a !important;
        border-color: #444 !important;
      ` : `
        background: #f5f5f5 !important;
        border-color: #ddd !important;
      `}
    }
    .ql-toolbar .ql-stroke { ${theme === 'dark' ? 'stroke: #aaa !important;' : 'stroke: #444 !important;'}
    .ql-toolbar .ql-fill { ${theme === 'dark' ? 'fill: #aaa !important;' : 'fill: #444 !important;'}
    .ql-toolbar .ql-picker { ${theme === 'dark' ? 'color: #aaa !important;' : 'color: #444 !important;'}
    .ql-container {
      ${theme === 'dark' ? `
        border-color: #444 !important;
        background: #1a1a1a;
      ` : `
        border-color: #ddd !important;
        background: #fff;
      `}
    }
    .ql-editor { min-height: 100px; }
    .ql-editor.ql-blank::before {
      color: ${theme === 'dark' ? '#666' : '#aaa'};
      font-style: normal;
    }
    .ql-snow .ql-picker-options {
      ${theme === 'dark' ? `
        background: #2a2a2a !important;
        border-color: #444 !important;
      ` : ''}
    }
  </style>
</head>
<body>
  <div id="toolbar-container">
    <span class="ql-formats">
      <button class="ql-bold" title="Bold"></button>
      <button class="ql-italic" title="Italic"></button>
      <button class="ql-underline" title="Underline"></button>
    </span>
    <span class="ql-formats">
      <button class="ql-list" value="ordered" title="Numbered List"></button>
      <button class="ql-list" value="bullet" title="Bullet List"></button>
    </span>
    <span class="ql-formats">
      <button class="ql-header" value="2" title="Heading"></button>
    </span>
    <span class="ql-formats">
      <button class="ql-clean" title="Clear Formatting"></button>
    </span>
  </div>
  <div id="editor-container"></div>
  <script>
    var quill = new Quill('#editor-container', {
      theme: 'snow',
      placeholder: '${placeholder}',
      modules: {
        toolbar: {
          container: '#toolbar-container'
        }
      }
    });

    quill.on('text-change', function() {
      var html = quill.root.innerHTML;
      var text = quill.getText();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'text-change',
        html: html,
        text: text
      }));
    });

    function setContent(html) {
      if (html && html.trim()) {
        quill.root.innerHTML = html;
      }
    }

    function getContent() {
      return quill.root.innerHTML;
    }

    function focus() {
      quill.focus();
    }

    function blur() {
      quill.blur();
    }

    window.setContent = setContent;
    window.getContent = getContent;
    window.focusEditor = focus;
    window.blurEditor = blur;
  </script>
</body>
</html>
`;

const INJECTED_JAVASCRIPT = `
(function() {
  function isLoaded() {
    return document.querySelector('.ql-editor') !== null;
  }

  if (isLoaded()) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  } else {
    setTimeout(isLoaded, 100);
  }
})();
true;
`;

export const ReactQuill = forwardRef<ReactQuillRef, ReactQuillProps>(
  ({ value = '', onChange, placeholder = 'write here...', editable = true, minHeight = 150 }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const [isReady, setIsReady] = useState(false);
    const [html, setHtml] = useState(value);
    const pendingContentRef = useRef<string | null>(null);

    const { theme, colors: themeColors } = useThemeStore();
    const isDark = theme === 'dark';
    const screenWidth = Dimensions.get('window').width;

    // Handle initial content
    useEffect(() => {
      if (isReady && value !== html && value !== pendingContentRef.current) {
        webViewRef.current?.injectJavaScript(`window.setContent(${JSON.stringify(value)});true;`);
        setHtml(value);
      }
    }, [value, isReady]);

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);

          switch (data.type) {
            case 'ready':
              setIsReady(true);
              // Send initial content if we have pending
              if (pendingContentRef.current) {
                webViewRef.current?.injectJavaScript(`window.setContent(${JSON.stringify(pendingContentRef.current)});true;`);
                pendingContentRef.current = null;
              }
              break;
            case 'text-change':
              setHtml(data.html);
              onChange?.(data.html);
              break;
          }
        } catch (e) {
          // Ignore non-JSON messages
        }
      },
      [onChange]
    );

    useImperativeHandle(ref, () => ({
      getHtml: async () => {
        if (webViewRef.current) {
          return new Promise((resolve) => {
            const subscription = webViewRef.current!.addEventListener('message', (e: WebViewMessageEvent) => {
              try {
                const data = JSON.parse(e.nativeEvent.data);
                if (data.type === 'get-html-response') {
                  resolve(data.html);
                  subscription.remove();
                }
              } catch (err) {}
            });
            webViewRef.current?.injectJavaScript(`
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'get-html-response',
                html: window.getContent()
              }));
              true;
            `);
            // Fallback timeout
            setTimeout(() => {
              subscription.remove();
              resolve(html);
            }, 500);
          });
        }
        return html;
      },
      getText: async () => {
        return html.replace(/<[^>]*>/g, '').trim();
      },
      blur: () => {
        webViewRef.current?.injectJavaScript('window.blurEditor();true;');
      },
      focus: () => {
        webViewRef.current?.injectJavaScript('window.focusEditor();true;');
      },
    }));

    if (!editable) {
      return (
        <View style={[stylesPreview.container, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[stylesPreview.text, { color: themeColors.text }]}>
            {value ? value.replace(/<[^>]*>/g, '') : ''}
          </Text>
        </View>
      );
    }

    const editorHtml = getEditorHtml(isDark ? 'dark' : 'light', placeholder);

    return (
      <View style={[styles.wrapper, { borderColor: themeColors.border }]}>
        <WebView
          ref={webViewRef}
          source={{ html: editorHtml, baseUrl: '' }}
          style={[styles.webView, { minHeight }]}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled={false}
          onMessage={handleMessage}
          injectedJavaScript={INJECTED_JAVASCRIPT}
          originWhitelist={['*']}
          mixedContentMode="always"
          thirdPartyCookiesEnabled
          supportMultipleWindows={false}
        />
      </View>
    );
  }
);

ReactQuill.displayName = 'ReactQuill';

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1.5,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

const stylesPreview = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    minHeight: 80,
  },
  text: {
    fontSize: 14,
    lineHeight: 22,
  },
});
