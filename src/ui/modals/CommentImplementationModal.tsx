import { colors } from "../colors.js"
import { fitCell, HintRow, PlainLine, standardModalDims, StandardModal } from "../primitives.js"
import type { CommentImplementationModalState } from "./types.js"

const wrapText = (text: string, width: number): readonly string[] =>
	text.split("\n").flatMap((line) => {
		if (line.length === 0) return [""]
		const rows: string[] = []
		for (let cursor = 0; cursor < line.length; cursor += width) rows.push(line.slice(cursor, cursor + width))
		return rows
	})

export const CommentImplementationModal = ({
	state,
	loadingIndicator,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: CommentImplementationModalState
	loadingIndicator: string
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const title =
		state.status === "running"
			? `${loadingIndicator} Implement comment`
			: state.status === "confirming"
				? `${loadingIndicator} Confirming implementation`
				: state.status === "done"
					? "Implementation complete"
					: "Implement comment"
	const rawBody =
		state.status === "running"
			? "Asking Codex to implement the selected review comment..."
			: state.status === "error"
				? (state.error ?? "Implementation failed")
				: [
						state.codexOutput ? `Codex:\n${state.codexOutput}` : "",
						state.diff ? `Diff:\n${state.diff}` : "Diff:\n(no changes)",
						state.checkoutPath ? `Checkout:\n${state.checkoutPath}` : "",
						state.commitMessage ? `Commit:\n${state.commitMessage}` : "",
						state.pushRemote ? `Push:\n${state.pushRemote}` : "",
						state.replyBody ? `Reply:\n${state.replyBody}` : "",
					]
						.filter(Boolean)
						.join("\n\n")
	const rows = wrapText(rawBody, contentWidth)
	const maxScroll = Math.max(0, rows.length - bodyHeight)
	const scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxScroll))
	const visibleRows = rows.slice(scrollOffset, scrollOffset + bodyHeight)

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			subtitle={<PlainLine text={fitCell(state.subtitle, contentWidth)} fg={colors.muted} />}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "↑↓", label: "scroll", disabled: maxScroll === 0 },
						{ key: "y", label: "copy codex", disabled: state.codexOutput.trim().length === 0 },
						{ key: "enter", label: "commit+push", disabled: state.status !== "ready" || state.diff.trim().length === 0 },
						{ key: "esc", label: state.status === "done" ? "close" : "cancel" },
					]}
				/>
			}
		>
			{visibleRows.map((line, index) => (
				<PlainLine key={index} text={fitCell(line, contentWidth)} fg={state.status === "error" ? colors.status.failing : colors.text} />
			))}
		</StandardModal>
	)
}
