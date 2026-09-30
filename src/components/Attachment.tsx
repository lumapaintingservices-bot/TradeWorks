import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import "./Attachment.css";

/**
 * Attachment card: a file or photo with its preview, name, details, upload state and small actions.
 * Plain-CSS port of shadcn/ui "Attachment" (same parts and props), styled with our tokens.
 *
 *   <Attachment state="uploading">
 *     <AttachmentMedia variant="image"><img … /></AttachmentMedia>
 *     <AttachmentContent><AttachmentTitle>kitchen.jpg</AttachmentTitle><AttachmentDescription>Uploading · 64%</AttachmentDescription></AttachmentContent>
 *     <AttachmentActions><AttachmentAction aria-label="Remove kitchen.jpg">…</AttachmentAction></AttachmentActions>
 *     <AttachmentTrigger aria-label="Open kitchen.jpg" onClick={…} />
 *   </Attachment>
 */
export type AttachmentState = "idle" | "uploading" | "processing" | "error" | "done";
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type RootProps = HTMLAttributes<HTMLDivElement> & {
  state?: AttachmentState; size?: "default" | "sm" | "xs"; orientation?: "horizontal" | "vertical";
  /** 0..1: a thin bar along the bottom while uploading */
  progress?: number;
};
export function Attachment({ state = "done", size = "default", orientation = "horizontal", progress, className, children, ...rest }: RootProps) {
  return (
    <div {...rest} data-state={state} className={cx("att", size !== "default" && "att-" + size, orientation === "vertical" && "att-v", "is-" + state, className)}>
      {children}
      {state === "uploading" && progress !== undefined && <span className="att-bar" style={{ width: Math.round(Math.max(0.04, Math.min(1, progress)) * 100) + "%" }} />}
    </div>
  );
}
export const AttachmentMedia = ({ variant = "icon", className, ...p }: HTMLAttributes<HTMLDivElement> & { variant?: "icon" | "image" }) =>
  <div {...p} className={cx("att-media", variant === "image" && "att-img", className)} />;
export const AttachmentContent = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div {...p} className={cx("att-body", className)} />;
export const AttachmentTitle = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div {...p} className={cx("att-title", className)} />;
export const AttachmentDescription = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div {...p} className={cx("att-desc", className)} />;
export const AttachmentActions = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div {...p} className={cx("att-actions", className)} />;
/** Icon-only: always give it an aria-label ("Remove kitchen.jpg"). */
export const AttachmentAction = ({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...p} className={cx("att-act", className)} />;
/** Covers the whole card (behind the actions) to open the photo. Give it an aria-label. */
export const AttachmentTrigger = ({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...p} className={cx("att-trigger", className)} />;
/** A horizontally scrolling, snapping row of attachments with an edge fade. */
export const AttachmentGroup = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div {...p} className={cx("att-group", className)} />;
