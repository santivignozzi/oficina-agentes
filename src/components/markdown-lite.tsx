import type { ReactNode } from 'react'

// Lo justo para leer una entrega: títulos, listas, citas y negrita. El texto viene de
// agentes, así que se arman nodos de React y nunca se inyecta HTML.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={index} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  )
}

const isItem = (line: string) => /^[-*] /.test(line)

function Block({ text }: { text: string }) {
  const lines = text.split('\n')
  const first = lines[0]

  const heading = /^#{1,4} (.*)$/.exec(first)
  if (heading) {
    const rest = lines.slice(1).join('\n')
    return (
      <>
        <h3 className="font-display text-[15px] font-medium">{inline(heading[1])}</h3>
        {rest && <Block text={rest} />}
      </>
    )
  }

  if (lines.every(isItem)) {
    return (
      <ul className="list-disc pl-5">
        {lines.map((line, index) => (
          <li key={index}>{inline(line.slice(2))}</li>
        ))}
      </ul>
    )
  }

  if (lines.every(line => line.startsWith('> '))) {
    return (
      <blockquote className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">
        {inline(lines.map(line => line.slice(2)).join(' '))}
      </blockquote>
    )
  }

  return <p className="whitespace-pre-wrap">{inline(text)}</p>
}

export function MarkdownLite({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter(block => block.trim().length > 0)
  return (
    <div className="flex flex-col gap-2 text-sm">
      {blocks.map((block, index) => (
        <Block key={index} text={block} />
      ))}
    </div>
  )
}
