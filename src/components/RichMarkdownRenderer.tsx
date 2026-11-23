import React, { useState } from 'react';
import { Copy, Check, FileText } from 'lucide-react';

interface RichMarkdownRendererProps {
  content: string;
  onSelectCitationTag?: (tagText: string) => void;
}

/**
 * Parses inline markdown syntax:
 * - `[Source X: ...]` or `**[Source X: ...]**` -> tactile clay citation pill
 * - `**bold**` -> <strong>
 * - `` `code` `` -> <code className="clay-inline-code">
 */
function renderInlineTokens(
  text: string,
  onSelectCitationTag?: (tagText: string) => void
): React.ReactNode[] {
  // Tokenize by citation tags, inline code, or bold spans
  const tokenRegex =
    /(\*\*\[Source\s+\d+[^\]]*\]\*\*|`\[Source\s+\d+[^\]]*\]`|\[Source\s+\d+[^\]]*\]|`[^`]+`|\*\*[^*]+\*\*)/g;

  const parts = text.split(tokenRegex);
  return parts.map((part, idx) => {
    if (!part) return null;

    // 1. Source Citation Pill (Supports single [Source 1] or multi [Source 2, Source 4])
    if (
      (part.startsWith('**[Source') && part.endsWith(']**')) ||
      (part.startsWith('`[Source') && part.endsWith(']`')) ||
      (part.startsWith('[Source') && part.endsWith(']'))
    ) {
      const cleanTag = part.replace(/^[`*\s]+|[`*\s]+$/g, '');
      const innerText = cleanTag.replace(/^\[|\]$/g, '');
      const sourceNums = Array.from(innerText.matchAll(/Source\s+(\d+)/gi)).map(
        (m) => m[1]
      );

      if (sourceNums.length > 1) {
        return (
          <span
            key={idx}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexWrap: 'wrap',
              verticalAlign: 'middle',
              margin: '0 3px',
            }}
          >
            {sourceNums.map((num) => (
              <button
                key={`${idx}-s-${num}`}
                type="button"
                data-tooltip={`Click to open Source #${num} in Document Preview & highlight passage`}
                onClick={() =>
                  onSelectCitationTag && onSelectCitationTag(`Source ${num}`)
                }
                className="clay-tag clay-tag-terracotta source-citation-pill"
                style={{
                  padding: '2px 9px',
                  fontSize: '0.7rem',
                  cursor: onSelectCitationTag ? 'pointer' : 'default',
                  border: 'none',
                }}
              >
                <FileText size={11} />
                <span>SOURCE {num}</span>
              </button>
            ))}
          </span>
        );
      }

      const labelNum = sourceNums[0] ? `SOURCE ${sourceNums[0]}` : innerText;
      return (
        <button
          key={idx}
          type="button"
          data-tooltip={`Click to open ${labelNum} in Document Preview & highlight passage`}
          onClick={() => onSelectCitationTag && onSelectCitationTag(cleanTag)}
          className="clay-tag clay-tag-terracotta source-citation-pill"
          style={{
            margin: '0 4px',
            padding: '2px 9px',
            fontSize: '0.7rem',
            cursor: onSelectCitationTag ? 'pointer' : 'default',
            verticalAlign: 'middle',
            border: 'none',
          }}
        >
          <FileText size={11} />
          <span>{innerText}</span>
        </button>
      );
    }

    // 2. Inline code `...`
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="font-mono"
          style={{
            backgroundColor: 'var(--clay-well)',
            color: 'var(--ink-primary)',
            padding: '2px 8px',
            borderRadius: 7,
            fontSize: '0.84em',
            fontWeight: 600,
            boxShadow:
              'inset 1.5px 1.5px 3px rgba(158, 146, 131, 0.45), inset -1.5px -1.5px 3px rgba(255, 255, 255, 0.75)',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // 3. Bold **...**
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong
          key={idx}
          style={{ fontWeight: 700, color: 'var(--ink-primary)' }}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function normalizeContentForTables(rawContent: string): string {
  let t = rawContent.replace(/\r\n/g, '\n');
  t = t.replace(
    /Sl\.[\s\n]+No\.[\s\n]+Title[\s\n]+Description[^\n]*/gi,
    '\nSl. No. Title Description Policy Clause Number\n'
  );
  t = t.replace(
    /(?:^|\n)\s*1\.[\s\n]+Name of[\s\n]+Insurance[\s\n]+Product\/[\s\n]+Policy[\s\n]+([^\n]+)/gi,
    '\n1. Name of Insurance Product/ Policy: $1'
  );
  t = t.replace(
    /(?:^|\n)\s*2\.[\s\n]+Policy[\s\n]+Number[\s\n]+([^\n]+)/gi,
    '\n2. Policy Number: $1'
  );
  t = t.replace(
    /(?:^|\n)\s*3\.[\s\n]+Type of[\s\n]+Insurance[\s\n]+Product\/[\s\n]+Policy[\s\n]+([^\n]+)/gi,
    '\n3. Type of Insurance Product/ Policy: $1'
  );
  t = t.replace(
    /(?:^|\n)\s*4\.[\s\n]+Sum[\s\n]+Insured[\s\n]+\(Basis\)[\s\n]+([^\n]+)/gi,
    '\n4. Sum Insured (Basis): $1'
  );
  t = t.replace(
    /(?:^|\n)\s*5\.[\s\n]+Policy[\s\n]+Coverage[\s\n]+\(What the[\s\n]+Policy[\s\n]+Covers\)[\s\n]*/gi,
    '\n5. Policy Coverage (What the Policy Covers): '
  );
  t = t.replace(
    /(?:^|\n)\s*6\.[\s\n]+Exclusion[\s\n]*s[\s\n]+\(What[\s\n]+the policy[\s\n]+does not[\s\n]+cover\)[\s\n]*/gi,
    '\n6. Exclusions (What the policy does not cover): '
  );
  t = t.replace(
    /(?:^|\n)\s*7\.[\s\n]+Waitin[\s\n]*g[\s\n]+period[\s\n]*/gi,
    '\n7. Waiting period: '
  );
  t = t.replace(
    /(?:^|\n)\s*8\.[\s\n]+Financial[\s\n]+Limits of[\s\n]+the[\s\n]+Coverag[\s\n]*e[\s\n]*/gi,
    '\n8. Financial Limits of the Coverage: '
  );
  // Break inline PDF CIS table headers & numbered rows onto separate lines if present in quoted evidence
  t = t.replace(/([.!?])\s+(Sl\.\s*No\.\s+Title\s+Description)/gi, '$1\n$2');
  t = t.replace(/(Policy Clause Number)\s+(?=\d{1,2}\.\s)/gi, '$1\n');
  t = t.replace(
    /([A-Za-z0-9)"'\]%])\s+"?((?:[1-9]|1\d|2[0-5])\.\s+(?:Name of Insurance|Policy Number|Type of Insurance|Sum Insured|Policy Coverage|Exclusions|Waitin\s*g?\s*period|Financial Limits|Claims\/|Policy Servicing|Grievances\/|Things to remember|Your Obligations|Investigation|Rest Cure|Obesity|Change-of-Gender|Cosmetic|Hazardous|Breach of law|Maternity|Excluded Providers|Initial Waiting|Pre-Existing|Specified disease))/gi,
    '$1\n$2'
  );
  return t;
}

function isPipeTableSeparator(line: string): boolean {
  const s = line.trim();
  if (!s.includes('|') || !s.includes('-')) return false;
  return /^\|?[\s\-:|]+\|[\s\-:|]+\|?$/.test(s);
}

function isPipeTableRow(line: string, nextLine?: string): boolean {
  const s = line.trim();
  if (!s || s.startsWith('```') || s.startsWith('#')) return false;
  if (s.startsWith('|') && s.includes('|', 1)) return true;
  if (s.includes('|') && nextLine && isPipeTableSeparator(nextLine)) {
    return true;
  }
  return false;
}

export const RichMarkdownRenderer: React.FC<RichMarkdownRendererProps> = ({
  content,
  onSelectCitationTag,
}) => {
  const [copiedBlockIdx, setCopiedBlockIdx] = useState<number | null>(null);

  if (!content) return null;

  const lines = normalizeContentForTables(content).split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // 1. Horizontal Rule ---
    if (/^-{3,}$/.test(trimmed)) {
      elements.push(
        <hr
          key={`hr-${i}`}
          style={{
            border: 'none',
            height: 2,
            backgroundColor: 'rgba(164, 152, 138, 0.3)',
            margin: '18px 0',
          }}
        />
      );
      i++;
      continue;
    }

    // 2. Fenced Code Block ```
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim() || 'code';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const codeText = codeLines.join('\n');
      const blockIdx = elements.length;

      elements.push(
        <div
          key={`code-${blockIdx}`}
          className="clay-well"
          style={{
            margin: '14px 0',
            padding: 0,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              backgroundColor: 'var(--clay-well-deep)',
              borderBottom: '1px solid rgba(255,255,255,0.4)',
            }}
          >
            <span
              className="font-mono"
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--ink-secondary)',
              }}
            >
              {lang}
            </span>
            <button
              type="button"
              className="clay-btn"
              style={{ padding: '4px 10px', fontSize: '0.7rem' }}
              onClick={() => {
                navigator.clipboard.writeText(codeText);
                setCopiedBlockIdx(blockIdx);
                setTimeout(() => setCopiedBlockIdx(null), 1800);
              }}
            >
              {copiedBlockIdx === blockIdx ? (
                <>
                  <Check size={12} />
                  <span>COPIED</span>
                </>
              ) : (
                <>
                  <Copy size={12} />
                  <span>COPY</span>
                </>
              )}
            </button>
          </div>
          <pre
            className="font-mono"
            style={{
              padding: '14px 18px',
              fontSize: '0.82rem',
              overflowX: 'auto',
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            <code>{codeText}</code>
          </pre>
        </div>
      );
      continue;
    }

    // 3. Markdown Pipe Table (| Col 1 | Col 2 | or Col 1 | Col 2)
    if (isPipeTableRow(trimmed, lines[i + 1])) {
      const tableLines: string[] = [];
      while (i < lines.length) {
        const curTrim = lines[i].trim();
        if (!curTrim) {
          if (i + 1 < lines.length && lines[i + 1].trim().includes('|')) {
            i++;
            continue;
          }
          break;
        }
        if (curTrim.includes('|') && !curTrim.startsWith('#')) {
          tableLines.push(curTrim);
          i++;
        } else {
          break;
        }
      }

      if (tableLines.length >= 2) {
        let trailingCitation = '';
        const parseRow = (rowStr: string): string[] => {
          let cleanedRow = rowStr.trim();
          // Only extract trailing citation if it sits outside a closing pipe "| [Source 1]"
          const trailingAfterPipe = cleanedRow.match(
            /\|\s*(\*\*\[Source[^\]]+\]\*\*|`\[Source[^\]]+\]`|\[Source[^\]]+\])\s*$/
          );
          if (trailingAfterPipe) {
            trailingCitation = trailingAfterPipe[1];
            cleanedRow = cleanedRow.slice(
              0,
              cleanedRow.length - trailingAfterPipe[0].length + 1
            );
          }
          return cleanedRow
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim());
        };

        const headerCells = parseRow(tableLines[0]);
        const bodyRows = tableLines
          .slice(1)
          .filter((r) => !isPipeTableSeparator(r))
          .map(parseRow);

        elements.push(
          <div key={`tbl-${i}`} style={{ margin: '14px 0' }}>
            <div className="doc-reader-table-wrap">
              <table className="doc-reader-table">
                <thead>
                  <tr>
                    {headerCells.map((h, hIdx) => (
                      <th key={hIdx}>
                        {renderInlineTokens(h, onSelectCitationTag)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {headerCells.map((_, cIdx) => (
                        <td key={cIdx}>
                          {renderInlineTokens(
                            row[cIdx] || '',
                            onSelectCitationTag
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {trailingCitation && (
              <div style={{ marginTop: 8 }}>
                {renderInlineTokens(trailingCitation, onSelectCitationTag)}
              </div>
            )}
          </div>
        );
        continue;
      }
    }

    // 3b. Structured Document / PDF CIS / Exclusion Table Block in Chat
    const parseChatStructuredRow = (
      s: string
    ): { cells: string[]; headers: string[] } | null => {
      const cisMatch = s.match(
        /^["']?(\d{1,2})\.\s+(Name of Insurance Product\/\s*Policy|Policy Number|Type of Insurance Product\/\s*Policy|Sum Insured\s*\(Basis\)|Policy Coverage\s*\(What the Policy Covers\)|Policy Coverage|Exclusions\s*\(what the policy does not cover\)|Waitin\s*g?\s*period|Financial Limits of the\s*Coverag\s*e|Claims\/\s*Claims Procedure|Policy Servicing|Grievances\/\s*Complaints|Things to remember|Your Obligations)\s*(.*)$/i
      );
      if (cisMatch) {
        return {
          cells: [
            `${cisMatch[1]}.`,
            cisMatch[2].replace(/\s+/g, ' ').trim(),
            cisMatch[3].replace(/^["']+|["']+$/g, '').trim() ||
              'See policy details',
          ],
          headers: ['Sl. No.', 'Policy Clause / Field', 'Details'],
        };
      }
      const exclMatch = s.match(
        /^["']?(\d{1,2})\.\s+([^:]{2,75}):\s*(\(Code[- ]*Excl\d+\).*|Not applicable.*)$/i
      );
      if (exclMatch) {
        return {
          cells: [`${exclMatch[1]}.`, exclMatch[2].trim(), exclMatch[3].trim()],
          headers: ['No.', 'Clause / Category', 'Code / Status'],
        };
      }
      return null;
    };

    const isCisHeaderInChat = /^Sl\.\s*No\.\s+Title\s+Description/i.test(
      trimmed
    );
    const firstChatRow = parseChatStructuredRow(trimmed);
    if (isCisHeaderInChat || firstChatRow) {
      let headers = firstChatRow
        ? firstChatRow.headers
        : ['Sl. No.', 'Policy Clause / Field', 'Details'];
      const rows: string[][] = [];
      if (firstChatRow) {
        rows.push(firstChatRow.cells);
      }
      i++;
      while (i < lines.length) {
        const nxt = lines[i].trim();
        if (!nxt) {
          i++;
          continue;
        }
        const parsedNxt = parseChatStructuredRow(nxt);
        if (parsedNxt) {
          headers = parsedNxt.headers;
          rows.push(parsedNxt.cells);
          i++;
        } else {
          break;
        }
      }
      if (rows.length >= 1) {
        elements.push(
          <div key={`struct-tbl-${i}`} className="doc-reader-table-wrap">
            <table className="doc-reader-table">
              <thead>
                <tr>
                  {headers.map((h, hIdx) => (
                    <th key={hIdx}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, rIdx) => (
                  <tr key={rIdx}>
                    {headers.map((_, cIdx) => (
                      <td
                        key={cIdx}
                        style={{ fontWeight: cIdx === 0 ? 700 : undefined }}
                      >
                        {renderInlineTokens(
                          r[cIdx] || '',
                          onSelectCitationTag
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // 4. Headings (#, ##, ###, ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const sizes: Record<number, string> = {
        1: '1.35rem',
        2: '1.18rem',
        3: '1.06rem',
        4: '0.96rem',
      };
      elements.push(
        <div
          key={`h-${i}`}
          className="font-display"
          style={{
            fontSize: sizes[level] || '1rem',
            fontWeight: 700,
            color: 'var(--ink-primary)',
            marginTop: elements.length === 0 ? 0 : 18,
            marginBottom: 8,
            paddingBottom: level <= 3 ? 6 : 0,
            borderBottom:
              level <= 2 ? '2px solid rgba(175, 162, 147, 0.25)' : 'none',
          }}
        >
          {renderInlineTokens(text, onSelectCitationTag)}
        </div>
      );
      i++;
      continue;
    }

    // 5. Unordered Bullet List (- or *)
    if (/^[-*]\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul
          key={`ul-${i}`}
          style={{
            margin: '10px 0 14px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}
        >
          {listItems.map((item, idx) => (
            <li
              key={idx}
              style={{
                fontSize: '0.94rem',
                lineHeight: 1.62,
                color: 'var(--ink-primary)',
              }}
            >
              {renderInlineTokens(item, onSelectCitationTag)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 6. Ordered Numbered List (1. 2. 3.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol
          key={`ol-${i}`}
          style={{
            margin: '10px 0 14px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {listItems.map((item, idx) => (
            <li
              key={idx}
              style={{
                fontSize: '0.94rem',
                lineHeight: 1.62,
                color: 'var(--ink-primary)',
              }}
            >
              {renderInlineTokens(item, onSelectCitationTag)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 7. Standard Paragraph
    elements.push(
      <p
        key={`p-${i}`}
        style={{
          fontSize: '0.95rem',
          lineHeight: 1.68,
          color: 'var(--ink-primary)',
          marginBottom: 12,
        }}
      >
        {renderInlineTokens(trimmed, onSelectCitationTag)}
      </p>
    );
    i++;
  }

  return <div>{elements}</div>;
};
