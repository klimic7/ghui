import { colors } from "../colors.js"
import { fitCell, HintRow, PlainLine, standardModalDims, StandardModal } from "../primitives.js"
import type { CodexExplanationModalState } from "./types.js"

const wrapText = (text: string, width: number): readonly string[] => {
	const rows: string[] = []
	for (const rawLine of text.split("\n")) {
		if (rawLine.length === 0) {
			rows.push("")
			continue
		}
		let remaining = rawLine
		while (remaining.length > width) {
			rows.push(remaining.slice(0, width))
			remaining = remaining.slice(width)
		}
		rows.push(remaining)
	}
	return rows
}

export const CodexExplanationModal = ({
	state,
	loadingIndicator,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: CodexExplanationModalState
	loadingIndicator: string
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const title = state.status === "loading" ? `${loadingIndicator} ${state.title}` : state.title
	const body =
		state.status === "loading"
			? [state.subject === "whole" ? "Asking Codex about the whole diff..." : "Asking Codex about the selected diff range..."]
			: wrapText(state.body.length > 0 ? state.body : "No explanation returned.", contentWidth)
	const maxScroll = Math.max(0, body.length - bodyHeight)
	const scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxScroll))
	const visibleRows = body.slice(scrollOffset, scrollOffset + bodyHeight)
	const bodyColor = state.status === "error" ? colors.status.failing : colors.text

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
						{ key: "esc", label: "close" },
					]}
				/>
			}
		>
			{visibleRows.map((line, index) => (
				<PlainLine key={index} text={fitCell(line, contentWidth)} fg={bodyColor} />
			))}
		</StandardModal>
	)
}
