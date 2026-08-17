import React from "react";
import Markdown, { MarkdownIt } from "react-native-markdown-display";

const coachMarkdownIt = MarkdownIt({
  typographer: true,
  linkify: true,
  html: false,
});

const coachBubbleMarkdownStyles = {
  body: {
    color: "#1f2937",
    fontSize: 14,
    lineHeight: 22,
  },
  text: { color: "#1f2937", fontSize: 14 },
  textgroup: {},
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
    flexWrap: "wrap" as const,
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    justifyContent: "flex-start" as const,
    width: "100%" as const,
  },
  strong: { fontWeight: "700" as const, color: "#111827" },
  em: { fontStyle: "italic" as const },
  s: { textDecorationLine: "line-through" as const },
  bullet_list: { marginBottom: 4 },
  ordered_list: { marginBottom: 4 },
  list_item: {},
  bullet_list_icon: { marginLeft: 0, marginRight: 8 },
  bullet_list_content: { flex: 1 },
  ordered_list_icon: { marginLeft: 0, marginRight: 8 },
  ordered_list_content: { flex: 1 },
  link: {
    color: "#006b5f",
    textDecorationLine: "underline" as const,
  },
  code_inline: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 13,
  },
  fence: {
    backgroundColor: "#f3f4f6",
    borderColor: "#e5e7eb",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
  },
  code_block: {
    backgroundColor: "#f3f4f6",
    borderColor: "#e5e7eb",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
  },
  blockquote: {
    backgroundColor: "#f9fafb",
    borderLeftColor: "#006b5f",
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    marginVertical: 6,
  },
  heading1: {
    fontSize: 20,
    fontWeight: "700" as const,
    marginBottom: 6,
    color: "#111827",
  },
  heading2: {
    fontSize: 18,
    fontWeight: "700" as const,
    marginBottom: 4,
    color: "#111827",
  },
  heading3: {
    fontSize: 16,
    fontWeight: "600" as const,
    marginBottom: 4,
    color: "#111827",
  },
  heading4: {
    fontSize: 15,
    fontWeight: "600" as const,
    marginBottom: 2,
    color: "#111827",
  },
  heading5: { fontSize: 14, fontWeight: "600" as const, color: "#374151" },
  heading6: { fontSize: 13, fontWeight: "600" as const, color: "#4b5563" },
  hr: {
    backgroundColor: "#e5e7eb",
    height: 1,
    marginVertical: 10,
  },
};

type Props = {
  content: string;
};

export function CoachMessageMarkdown({ content }: Props) {
  return (
    <Markdown
      markdownit={coachMarkdownIt}
      style={coachBubbleMarkdownStyles}
      mergeStyle
      onLinkPress={() => true}
    >
      {content}
    </Markdown>
  );
}
