import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
  Link,
  Eraser,
  AlignLeft,
  AlignCenter,
  AlignRight,
  IndentIncrease,
  IndentDecrease,
  Code,
} from "lucide-react";
import { sanitizeHtml } from "../domain/content";

export function RichEditor({
  value,
  onChange,
  label,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  compact?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: sanitizeHtml(value),
    editorProps: {
      attributes: {
        "aria-label": label,
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => onChange(sanitizeHtml(editor.getHTML())),
  });
  useEffect(() => {
    if (editor && sanitizeHtml(value) !== sanitizeHtml(editor.getHTML()))
      editor.commands.setContent(sanitizeHtml(value), { emitUpdate: false });
  }, [value, editor]);
  if (!editor) return <div className="skeleton editor-skeleton" />;
  const items = [
    {
      title: "Negrito",
      Icon: Bold,
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      title: "Itálico",
      Icon: Italic,
      active: editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      title: "Sublinhado",
      Icon: Underline,
      active: editor.isActive("underline"),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      title: "Tachado",
      Icon: Strikethrough,
      active: editor.isActive("strike"),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      title: "Destacar",
      Icon: Highlighter,
      active: editor.isActive("highlight"),
      run: () => editor.chain().focus().toggleHighlight().run(),
    },
    {
      title: "Lista",
      Icon: List,
      active: editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      title: "Lista numerada",
      Icon: ListOrdered,
      active: editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      title: "Aumentar recuo de item",
      Icon: IndentIncrease,
      run: () => editor.chain().focus().sinkListItem("listItem").run(),
    },
    {
      title: "Diminuir recuo de item",
      Icon: IndentDecrease,
      run: () => editor.chain().focus().liftListItem("listItem").run(),
    },
    {
      title: "Citação",
      Icon: Quote,
      active: editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      title: "Código",
      Icon: Code,
      active: editor.isActive("code"),
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      title: "Alinhar à esquerda",
      Icon: AlignLeft,
      run: () => editor.chain().focus().setTextAlign("left").run(),
    },
    {
      title: "Centralizar",
      Icon: AlignCenter,
      run: () => editor.chain().focus().setTextAlign("center").run(),
    },
    {
      title: "Alinhar à direita",
      Icon: AlignRight,
      run: () => editor.chain().focus().setTextAlign("right").run(),
    },
    {
      title: "Inserir ou remover link",
      Icon: Link,
      run: () => {
        const url = window.prompt(
          "Endereço do link (deixe vazio para remover)",
          editor.getAttributes("link").href ?? "https://",
        );
        if (url === null) return;
        if (!url) editor.chain().focus().unsetLink().run();
        else if (/^https?:\/\//i.test(url))
          editor.chain().focus().setLink({ href: url }).run();
        else window.alert("Use um endereço começando com https:// ou http://.");
      },
    },
    {
      title: "Remover formatação",
      Icon: Eraser,
      run: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    },
    {
      title: "Desfazer",
      Icon: Undo2,
      run: () => editor.chain().focus().undo().run(),
    },
    {
      title: "Refazer",
      Icon: Redo2,
      run: () => editor.chain().focus().redo().run(),
    },
  ];
  return (
    <div className={`rich-editor ${compact ? "compact" : ""}`}>
      <div
        className="editor-toolbar"
        role="toolbar"
        aria-label={`Formatação: ${label}`}
      >
        <select
          aria-label="Estilo do parágrafo"
          value={
            editor.isActive("heading", { level: 2 })
              ? "2"
              : editor.isActive("heading", { level: 3 })
                ? "3"
                : "p"
          }
          onChange={(e) => {
            if (e.target.value === "p")
              editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .toggleHeading({ level: Number(e.target.value) as 2 | 3 })
                .run();
          }}
        >
          <option value="p">Texto</option>
          <option value="2">Título</option>
          <option value="3">Subtítulo</option>
        </select>
        {items.map(({ title, Icon, active, run }) => (
          <button
            type="button"
            key={title}
            title={title}
            aria-label={title}
            aria-pressed={!!active}
            className={active ? "active" : ""}
            onClick={run}
          >
            <Icon size={15} />
          </button>
        ))}
        <label className="color-input" title="Cor do texto">
          <span className="sr-only">Cor do texto</span>
          <input
            type="color"
            value={editor.getAttributes("textStyle").color ?? "#263c32"}
            onChange={(e) =>
              editor.chain().focus().setColor(e.target.value).run()
            }
          />
        </label>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichText({
  html,
  className = "",
}: {
  html: string;
  className?: string;
}) {
  return (
    <div
      className={`rich-content ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}
