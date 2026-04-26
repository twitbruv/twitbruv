import { useEffect, useState } from "react"
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from "lexical"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $setBlocksType } from "@lexical/selection"
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text"
import { $createCodeNode } from "@lexical/code"
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list"
import { TOGGLE_LINK_COMMAND } from "@lexical/link"
import {
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  BracketsCurlyIcon,
  CodeIcon,
  LinkIcon,
  ListIcon,
  ListNumbersIcon,
  QuotesIcon,
  TextBIcon,
  TextHThreeIcon,
  TextHTwoIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import type { HeadingTagType } from "@lexical/rich-text"

type Format = "bold" | "italic" | "underline" | "strikethrough" | "code"

export function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext()
  const [active, setActive] = useState<Set<Format>>(new Set())

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        editor.getEditorState().read(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return
          const next = new Set<Format>()
          if (selection.hasFormat("bold")) next.add("bold")
          if (selection.hasFormat("italic")) next.add("italic")
          if (selection.hasFormat("underline")) next.add("underline")
          if (selection.hasFormat("strikethrough")) next.add("strikethrough")
          if (selection.hasFormat("code")) next.add("code")
          setActive(next)
        })
        return false
      },
      1
    )
  }, [editor])

  function toggle(format: Format) {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
  }
  function setHeading(tag: HeadingTagType) {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createHeadingNode(tag))
    })
  }
  function setParagraph() {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createParagraphNode())
    })
  }
  function setQuote() {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createQuoteNode())
    })
  }
  function setCodeBlock() {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createCodeNode())
    })
  }
  function insertList(kind: "ul" | "ol") {
    editor.dispatchCommand(
      kind === "ul"
        ? INSERT_UNORDERED_LIST_COMMAND
        : INSERT_ORDERED_LIST_COMMAND,
      undefined
    )
  }
  function toggleLink() {
    const url = prompt("Link URL:")
    if (url === null) return
    if (url.trim() === "") {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
    }
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-background/90 px-2 py-1.5 backdrop-blur-sm">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        aria-label="undo"
      >
        <ArrowUUpLeftIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        aria-label="redo"
      >
        <ArrowUUpRightIcon className="size-4" />
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-pressed={active.has("bold")}
        aria-label="bold"
        onClick={() => toggle("bold")}
      >
        <TextBIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-pressed={active.has("italic")}
        aria-label="italic"
        onClick={() => toggle("italic")}
      >
        <TextItalicIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-pressed={active.has("underline")}
        aria-label="underline"
        onClick={() => toggle("underline")}
      >
        <TextUnderlineIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-pressed={active.has("strikethrough")}
        aria-label="strikethrough"
        onClick={() => toggle("strikethrough")}
      >
        <TextStrikethroughIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-pressed={active.has("code")}
        aria-label="inline code"
        onClick={() => toggle("code")}
      >
        <CodeIcon className="size-4" />
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="heading 2"
        onClick={() => setHeading("h2")}
      >
        <TextHTwoIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="heading 3"
        onClick={() => setHeading("h3")}
      >
        <TextHThreeIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="paragraph"
        onClick={setParagraph}
      >
        ¶
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="quote"
        onClick={setQuote}
      >
        <QuotesIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="code block"
        onClick={setCodeBlock}
      >
        <BracketsCurlyIcon className="size-4" />
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="bulleted list"
        onClick={() => insertList("ul")}
      >
        <ListIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="numbered list"
        onClick={() => insertList("ol")}
      >
        <ListNumbersIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="link"
        onClick={toggleLink}
      >
        <LinkIcon className="size-4" />
      </Button>
    </div>
  )
}
