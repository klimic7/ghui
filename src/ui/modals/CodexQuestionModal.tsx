import { colors } from "../colors.js"
import { fitCell, HintRow, PlainLine, standardModalDims, StandardModal, TextLine } from "../primitives.js"
import type { CodexQuestionModalState } from "./types.js"

export const CodexQuestionModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: CodexQuestionModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { contentWidth } = standardModalDims(modalWidth, modalHeight)
	const inputText = state.question.length > 0 ? state.question : "Ask Codex about this selection"

	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title="Ask Codex"
			subtitle={
				<TextLine>
					<span fg={colors.count}>› </span>
					<span fg={state.question.length > 0 ? colors.text : colors.muted}>{fitCell(inputText, Math.max(1, contentWidth - 2))}</span>
				</TextLine>
			}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "enter", label: "ask" },
						{ key: "ctrl-u", label: "clear" },
						{ key: "ctrl-w", label: "word" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			}
		>
			<PlainLine text={fitCell(state.contextLabel, contentWidth)} fg={colors.muted} />
			{state.error ? <PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} /> : null}
		</StandardModal>
	)
}
