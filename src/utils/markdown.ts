import MarkdownIt from 'markdown-it'
import katex from 'katex'

/* =========================================================
   markdown-it + KaTeX 渲染器
   - 标准 GFM Markdown
   - $$...$$ 块级 LaTeX
   - $...$ 行内 LaTeX
   - 代码块 + 行内代码
   - 安全: HTML 标签转义
   ========================================================= */

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true,
})

/* ---------- KaTeX LaTeX 支持 ---------- */

// 块级数学 $$...$$
const BLOCK_MATH_RE = /^\$\$(.*?)\$\$/ms
const INLINE_MATH_RE = /\$(.+?)\$/g

// 保存原始 fence 渲染器用于代码块
const defaultFence = md.renderer.rules.fence

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const code = token.content.trim()

  // 检测是否为 LaTeX 块 (以 $$ 开头和结尾)
  if (code.startsWith('$$') && code.endsWith('$$')) {
    const latex = code.slice(2, -2).trim()
    try {
      return katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
      })
    } catch {
      return `<pre><code>${md.utils.escapeHtml(code)}</code></pre>`
    }
  }

  return defaultFence ? defaultFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
}

// 自定义内联规则: 在 core 阶段处理 $...$
md.core.ruler.push('katex_inline', (state) => {
  const tokens = state.tokens

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (token.type === 'inline' && token.content) {
      const content = token.content

      // 尝试匹配 LaTeX 内联 $...$
      if (content.includes('$')) {
        const parts: string[] = []
        let lastIndex = 0
        let match: RegExpExecArray | null

        // 重置正则
        INLINE_MATH_RE.lastIndex = 0

        while ((match = INLINE_MATH_RE.exec(content)) !== null) {
          // 前面的普通文本
          if (match.index > lastIndex) {
            parts.push(content.slice(lastIndex, match.index))
          }

          const latex = match[1].trim()
          try {
            parts.push(katex.renderToString(latex, {
              displayMode: false,
              throwOnError: false,
            }))
          } catch {
            parts.push(`$${latex}$`)
          }

          lastIndex = match.index + match[0].length
        }

        // 剩余文本
        if (lastIndex < content.length) {
          parts.push(content.slice(lastIndex))
        }

        if (parts.length > 1 || lastIndex > 0) {
          // 重建 token: 用新的内 Children 替换
          const newHtml = parts.join('')
          token.children = [
            {
              type: 'html_inline',
              content: newHtml,
              tag: '',
              attrs: null,
              map: null,
              nesting: 0,
              level: 0,
              children: null,
              markup: '',
              info: '',
              meta: null,
              block: false,
              hidden: false,
            },
          ]
        }
      }
    }
  }

  return false
})

/**
 * 将文本中的 LaTeX 块级公式 $$...$$ 预处理为 fence 代码块
 * 使得 markdown-it 的 fence 规则可以处理它们
 */
function preprocessLatexBlocks(text: string): string {
  return text.replace(/\$\$([\s\S]*?)\$\$/g, (_match, code) => {
    return `\`\`\`\n\$\$${code}\$\$\n\`\`\``
  })
}

/**
 * 渲染 Markdown 文本为 HTML
 * 支持: GFM 语法、$$ 块级 LaTeX、$ 行内 LaTeX
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''

  // 预处理 LaTeX 块
  const processed = preprocessLatexBlocks(text)

  // 渲染
  const html = md.render(processed)

  // 清理多余的 empty 段落
  return html
}

/**
 * 简单的纯文本截断（用于预览等）
 */
export function stripMarkdown(text: string, maxLen = 200): string {
  const html = renderMarkdown(text)
  const plain = html.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ')
  if (plain.length <= maxLen) return plain
  return plain.slice(0, maxLen) + '…'
}

export default md
