import { TextAttributes, type DiffRenderable, type MouseEvent, type ScrollBoxRenderable } from "@opentui/core"
import { useMemo, type Ref } from "react"
import type { DiffCommentSide, PullRequestItem, PullRequestReviewComment } from "../domain.js"
import { colors, lineNumberTextColor, type ThemeId } from "./colors.js"
import { CommentBodyLine, commentCountText, commentMetaSegments, CommentSegmentsLine } from "./comments.js"
import {
	createDiffSyntaxStyle,
	diffCommentAnchorLabel,
	diffCommentLineLabel,
	diffFileStats,
	diffFileStatsText,
	diffStatText,
	stackedDiffFileIndexAtLine,
	type DiffFileStats,
	type DiffView,
	type DiffWhitespaceMode,
	type DiffWrapMode,
	type PullRequestDiffState,
	type StackedDiffCommentAnchor,
	type StackedDiffFilePatch,
} from "./diff.js"
import { LoadingPane, StatusCard } from "./DetailsPane.js"
import { DiffStats } from "./diffStats.js"
import { Divider, fitCell, PaddedRow, PlainLine, TextLine } from "./primitives.js"
import { shortRepoName } from "./pullRequests.js"

const DiffPaneHeader = ({ pullRequest, paneWidth }: { pullRequest: PullRequestItem; paneWidth: number }) => {
	const stats = diffStatText(pullRequest)
	const headerWidth = Math.max(24, paneWidth - 2)
	const leftHeader = `#${pullRequest.number} ${shortRepoName(pullRequest.repository)}`
	const headerGap = Math.max(2, headerWidth - leftHeader.length - stats.length)
	return (
		<PaddedRow>
			<TextLine>
				<span fg={colors.count}>#{pullRequest.number}</span>
				<span fg={colors.muted}> {shortRepoName(pullRequest.repository)}</span>
				<span fg={colors.muted}>{" ".repeat(headerGap)}</span>
				<DiffStats pullRequest={pullRequest} />
			</TextLine>
		</PaddedRow>
	)
}

const FileStats = ({ stats }: { stats: DiffFileStats }) => {
	return (
		<>
			{stats.additions > 0 ? <span fg={colors.status.passing}>{`+${stats.additions}`}</span> : null}
			{stats.additions > 0 && stats.deletions > 0 ? <span fg={colors.muted}> </span> : null}
			{stats.deletions > 0 ? <span fg={colors.status.failing}>{`-${stats.deletions}`}</span> : null}
		</>
	)
}

const FileHeader = ({
	file,
	index,
	count,
	width,
	reviewSuffix = "",
	reviewSuffixColor = colors.muted,
	suffix = "",
	suffixColor = colors.muted,
}: {
	file: StackedDiffFilePatch["file"]
	index: number
	count: number
	width: number
	reviewSuffix?: string
	reviewSuffixColor?: string
	suffix?: string
	suffixColor?: string
}) => {
	const counter = `${index + 1}/${count}`
	const stats = diffFileStats(file)
	const statsText = diffFileStatsText(stats)
	const nameWidth = Math.max(1, width - counter.length - statsText.length - reviewSuffix.length - suffix.length - 5)
	return (
		<TextLine>
			<span fg={colors.muted}>{counter} </span>
			<span fg={colors.text}>{fitCell(file.name, nameWidth)}</span>
			{statsText ? <span fg={colors.muted}> </span> : null}
			<FileStats stats={stats} />
			{reviewSuffix ? <span fg={reviewSuffixColor}>{reviewSuffix}</span> : null}
			{suffix ? <span fg={suffixColor}>{suffix}</span> : null}
		</TextLine>
	)
}

export const PullRequestDiffPane = ({
	pullRequest,
	diffState,
	stackedFiles,
	scrollTop,
	view,
	whitespaceMode,
	wrapMode,
	paneWidth,
	height,
	loadingIndicator,
	scrollRef,
	setDiffRef,
	selectedCommentAnchor,
	selectedCommentLabel,
	selectedCommentThread,
	selectedFileIndex,
	reviewedAnchors,
	reviewedFileStats,
	onSelectCommentLine,
	themeId,
	themeGeneration,
}: {
	pullRequest: PullRequestItem | null
	diffState: PullRequestDiffState | undefined
	stackedFiles: readonly StackedDiffFilePatch[]
	scrollTop: number
	view: DiffView
	whitespaceMode: DiffWhitespaceMode
	wrapMode: DiffWrapMode
	paneWidth: number
	height: number
	loadingIndicator: string
	scrollRef: Ref<ScrollBoxRenderable>
	setDiffRef: (index: number, diff: DiffRenderable | null) => void
	selectedCommentAnchor: StackedDiffCommentAnchor | null
	selectedCommentLabel: string | null
	selectedCommentThread: readonly PullRequestReviewComment[]
	selectedFileIndex: number | null
	reviewedAnchors: readonly StackedDiffCommentAnchor[]
	reviewedFileStats: Readonly<Record<number, { readonly reviewed: number; readonly total: number }>>
	onSelectCommentLine: (renderLine: number, side: DiffCommentSide | null) => void
	themeId: ThemeId
	themeGeneration: number
}) => {
	const readyFiles = diffState?._tag === "Ready" ? diffState.files : []
	const syntaxStyle = useMemo(() => createDiffSyntaxStyle(), [themeId, themeGeneration])

	if (!pullRequest) {
		return <LoadingPane content={{ title: "No pull request selected", hint: "Press esc to go back" }} width={paneWidth} height={height} />
	}

	if (!diffState || diffState._tag === "Loading") {
		return (
			<box height={height} flexDirection="column">
				<DiffPaneHeader pullRequest={pullRequest} paneWidth={paneWidth} />
				<Divider width={paneWidth} />
				<LoadingPane content={{ title: `${loadingIndicator} Loading diff`, hint: "Fetching patch from GitHub" }} width={paneWidth} height={Math.max(1, height - 2)} />
			</box>
		)
	}

	if (diffState._tag === "Error") {
		return (
			<box height={height} flexDirection="column">
				<PaddedRow>
					<PlainLine text={`#${pullRequest.number} ${shortRepoName(pullRequest.repository)} diff`} fg={colors.count} bold />
				</PaddedRow>
				<Divider width={paneWidth} />
				<StatusCard content={{ title: "Could not load diff", hint: diffState.error }} width={paneWidth} />
			</box>
		)
	}

	if (readyFiles.length === 0 || stackedFiles.length === 0) {
		return (
			<LoadingPane
				content={{
					title: whitespaceMode === "ignore" ? "No non-whitespace diff" : "No diff",
					hint: whitespaceMode === "ignore" ? "Use the command palette to show whitespace changes" : "This PR has no patch contents",
				}}
				width={paneWidth}
				height={height}
			/>
		)
	}

	const hasSelectedCommentAnchor = selectedCommentAnchor !== null
	const commentPeek = hasSelectedCommentAnchor && selectedCommentThread.length > 0 ? selectedCommentThread[selectedCommentThread.length - 1]! : null
	const scrollBoxHeight = Math.max(1, height - 2 - (commentPeek ? 3 : 0))
	const commentPeekMeta =
		commentPeek && selectedCommentAnchor
			? commentMetaSegments({
					item: commentPeek,
					markerLabel: diffCommentLineLabel(selectedCommentAnchor),
					groups: [
						[{ text: commentCountText(selectedCommentThread.length), fg: colors.muted }],
						[
							{ text: "enter", fg: colors.text },
							{ text: " thread", fg: colors.muted },
						],
					],
				})
			: []
	const stickyScrollTop = Math.max(0, Math.floor(scrollTop))
	const stickyArrayIndex = stackedDiffFileIndexAtLine(stackedFiles, stickyScrollTop)
	const stickyFile = stickyArrayIndex >= 0 ? stackedFiles[stickyArrayIndex] : stackedFiles[0]
	const incomingStickyFile = stickyArrayIndex >= 0 ? stackedFiles[stickyArrayIndex + 1] : undefined
	const incomingHeaderDistance = incomingStickyFile ? incomingStickyFile.headerLine - stickyScrollTop : Number.POSITIVE_INFINITY
	const incomingFile = incomingHeaderDistance === 1 ? incomingStickyFile : undefined
	const stickyCommentLabelFor = (stackedFile: StackedDiffFilePatch | undefined) => {
		if (!selectedCommentAnchor) return "  no lines"
		if (selectedCommentAnchor.fileIndex !== stackedFile?.index) return ""
		return `  ${selectedCommentLabel ?? diffCommentAnchorLabel(selectedCommentAnchor)}`
	}
	const reviewSuffixFor = (stackedFile: StackedDiffFilePatch | undefined) => {
		const stats = stackedFile ? reviewedFileStats[stackedFile.index] : undefined
		if (!stats || stats.total === 0 || stats.reviewed === 0) return ""
		return stats.reviewed === stats.total ? "  ✓ reviewed" : `  ${stats.reviewed}/${stats.total} checked`
	}
	const reviewSuffixColorFor = (stackedFile: StackedDiffFilePatch | undefined) => {
		const stats = stackedFile ? reviewedFileStats[stackedFile.index] : undefined
		return stats && stats.total > 0 && stats.reviewed === stats.total ? colors.status.passing : colors.status.pending
	}
	const fileHeaderBgFor = (stackedFile: StackedDiffFilePatch | undefined) => (selectedFileIndex === stackedFile?.index ? colors.selectedBg : colors.background)
	const stickyCommentColor = selectedCommentAnchor?.side === "LEFT" ? colors.status.failing : colors.status.passing
	const diffLineNumberFg = lineNumberTextColor(colors.diff.lineNumberBg, colors.text)
	const reviewedMarkers = reviewedAnchors
		.map((anchor) => ({ key: `${anchor.path}:${anchor.side}:${anchor.line}`, top: 2 + anchor.renderLine - stickyScrollTop }))
		.filter((marker) => marker.top >= 4 && marker.top < 2 + scrollBoxHeight)
	const handleDiffMouseDown = function (this: ScrollBoxRenderable, event: MouseEvent) {
		if (event.button !== 0) return
		const localY = event.y - this.viewport.y
		if (localY < 0 || localY >= this.viewport.height) return
		const localX = event.x - this.viewport.x
		const side = view === "split" ? (localX < Math.floor(paneWidth / 2) ? "LEFT" : "RIGHT") : null
		onSelectCommentLine(Math.max(0, Math.floor(this.scrollTop + localY)), side)
		event.preventDefault()
		event.stopPropagation()
	}

	return (
		<box height={height} flexDirection="column">
			<DiffPaneHeader pullRequest={pullRequest} paneWidth={paneWidth} />
			<Divider width={paneWidth} />
			<scrollbox ref={scrollRef} focusable={false} flexGrow={1} scrollY scrollX={false} onMouseDown={handleDiffMouseDown}>
				{stackedFiles.map((stackedFile) => (
					<box key={`${pullRequest.url}-${stackedFile.index}-${view}-${wrapMode}`} flexDirection="column" flexShrink={0}>
						{stackedFile.index > 0 ? <Divider width={paneWidth} /> : null}
						<PaddedRow {...(selectedFileIndex === stackedFile.index ? { backgroundColor: colors.selectedBg } : {})}>
							<FileHeader
								file={stackedFile.file}
								index={stackedFile.index}
								count={readyFiles.length}
								width={paneWidth}
								reviewSuffix={reviewSuffixFor(stackedFile)}
								reviewSuffixColor={reviewSuffixColorFor(stackedFile)}
							/>
						</PaddedRow>
						<Divider width={paneWidth} />
						{stackedFile.diffHeight > 0 ? (
							<diff
								ref={(diff: DiffRenderable | null) => setDiffRef(stackedFile.index, diff)}
								diff={stackedFile.file.patch}
								view={view}
								syncScroll
								filetype={stackedFile.file.filetype ?? "text"}
								syntaxStyle={syntaxStyle}
								fg={colors.text}
								showLineNumbers
								wrapMode={wrapMode}
								addedBg={colors.diff.addedBg}
								removedBg={colors.diff.removedBg}
								contextBg={colors.diff.contextBg}
								addedSignColor={colors.status.passing}
								removedSignColor={colors.status.failing}
								lineNumberFg={diffLineNumberFg}
								lineNumberBg={colors.diff.lineNumberBg}
								addedLineNumberBg={colors.diff.addedLineNumberBg}
								removedLineNumberBg={colors.diff.removedLineNumberBg}
								selectionBg={colors.selectedBg}
								selectionFg={colors.selectedText}
								height={stackedFile.diffHeight}
								style={{ flexShrink: 0 }}
							/>
						) : null}
					</box>
				))}
			</scrollbox>
			{reviewedMarkers.map((marker) => (
				<box key={marker.key} position="absolute" top={marker.top} left={0} width={2} height={1} zIndex={11}>
					<text fg={colors.background} bg={colors.link} attributes={TextAttributes.BOLD}>
						✓
					</text>
				</box>
			))}
			{stickyFile ? (
				<box position="absolute" top={2} left={0} width={paneWidth} height={2} zIndex={10} flexDirection="column" backgroundColor={colors.background}>
					{incomingFile ? (
						<>
							<Divider width={paneWidth} />
							<PaddedRow backgroundColor={fileHeaderBgFor(incomingFile)}>
								<FileHeader
									file={incomingFile.file}
									index={incomingFile.index}
									count={readyFiles.length}
									width={paneWidth}
									reviewSuffix={reviewSuffixFor(incomingFile)}
									reviewSuffixColor={reviewSuffixColorFor(incomingFile)}
									suffix={stickyCommentLabelFor(incomingFile)}
									suffixColor={stickyCommentColor}
								/>
							</PaddedRow>
						</>
					) : (
						<>
							<PaddedRow backgroundColor={fileHeaderBgFor(stickyFile)}>
								<FileHeader
									file={stickyFile.file}
									index={stickyFile.index}
									count={readyFiles.length}
									width={paneWidth}
									reviewSuffix={reviewSuffixFor(stickyFile)}
									reviewSuffixColor={reviewSuffixColorFor(stickyFile)}
									suffix={stickyCommentLabelFor(stickyFile)}
									suffixColor={stickyCommentColor}
								/>
							</PaddedRow>
							<Divider width={paneWidth} />
						</>
					)}
				</box>
			) : null}
			{commentPeek ? (
				<>
					<Divider width={paneWidth} />
					<PaddedRow>
						<CommentSegmentsLine segments={commentPeekMeta} />
					</PaddedRow>
					<PaddedRow>
						<CommentBodyLine body={commentPeek.body} width={Math.max(1, paneWidth - 2)} />
					</PaddedRow>
				</>
			) : null}
		</box>
	)
}
