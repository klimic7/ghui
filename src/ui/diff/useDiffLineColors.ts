import type { DiffRenderable } from "@opentui/core"
import { type MutableRefObject, useEffect, useRef } from "react"
import { colors, mixHex } from "../colors.js"
import { type DiffCommentAnchor, type DiffCommentKind, type DiffView, type StackedDiffCommentAnchor } from "../diff.js"

const DIFF_LAYOUT_RETRY_MS = 16
const DIFF_LINE_COLOR_REAPPLY_ATTEMPTS = 8

type DiffLineColorConfig = {
	readonly gutter: string
	readonly content: string
}

type DiffSideRenderable = {
	readonly setLineColor: (line: number, color: DiffLineColorConfig) => void
}

type DiffRenderableRuntimeSides = {
	readonly leftSide?: DiffSideRenderable
	readonly rightSide?: DiffSideRenderable
}

interface AppliedDiffLineColor {
	readonly anchor: StackedDiffCommentAnchor
	readonly view: DiffView
	readonly color: DiffLineColorConfig
}

interface AppliedDiffLineColorState {
	readonly contextKey: string | null
	readonly entries: readonly AppliedDiffLineColor[]
}

const originalDiffLineColor = (anchor: DiffCommentAnchor): DiffLineColorConfig => {
	if (anchor.kind === "addition") {
		return { gutter: colors.diff.addedLineNumberBg, content: colors.diff.addedBg }
	}
	if (anchor.kind === "deletion") {
		return { gutter: colors.diff.removedLineNumberBg, content: colors.diff.removedBg }
	}
	return { gutter: colors.diff.lineNumberBg, content: colors.diff.contextBg }
}

const selectedDiffCommentAccentByKind = {
	addition: () => colors.status.passing,
	deletion: () => colors.status.failing,
	context: () => colors.muted,
} satisfies Record<DiffCommentKind, () => string>

const selectedDiffCommentAccent = (kind: DiffCommentKind) => selectedDiffCommentAccentByKind[kind]()

const mixDiffLineContentColor = (base: string, accent: string, amount: number) => mixHex(base === "transparent" ? colors.background : base, accent, amount)

const diffCommentLineColor = (anchor: DiffCommentAnchor, kind: "selected" | "range" | "thread"): DiffLineColorConfig => {
	const original = originalDiffLineColor(anchor)
	const accent = kind === "thread" ? colors.status.pending : selectedDiffCommentAccent(anchor.kind)
	if (kind === "thread") return { ...original, gutter: mixHex(original.gutter, accent, 0.3) }
	return {
		gutter: mixHex(original.gutter, accent, kind === "selected" ? 0.38 : 0.26),
		content: mixDiffLineContentColor(original.content, accent, kind === "selected" ? 0.2 : 0.1),
	}
}

const diffSideTargets = (diff: DiffRenderable, anchor: DiffCommentAnchor, view: DiffView) => {
	const withSides = diff as unknown as DiffRenderableRuntimeSides
	if (view === "split") {
		const target = anchor.side === "LEFT" ? withSides.leftSide : withSides.rightSide
		return target ? [target] : []
	}
	return withSides.leftSide ? [withSides.leftSide] : []
}

const setDiffCommentLineColor = (diff: DiffRenderable, entry: AppliedDiffLineColor) => {
	for (const target of diffSideTargets(diff, entry.anchor, entry.view)) {
		target.setLineColor(entry.anchor.colorLine, entry.color)
	}
}

export interface UseDiffLineColorsInput {
	readonly diffLineColorContextKey: string | null
	readonly effectiveDiffRenderView: DiffView
	readonly selectedDiffCommentAnchor: StackedDiffCommentAnchor | null
	readonly selectedDiffCommentRangeAnchors: readonly StackedDiffCommentAnchor[]
	readonly diffCommentThreadAnchors: readonly StackedDiffCommentAnchor[]
	readonly suppressNextDiffCommentScrollRef: MutableRefObject<boolean>
	readonly ensureDiffLineVisible: (line: number) => void
}

export interface UseDiffLineColorsResult {
	readonly setDiffRenderableRef: (index: number, diff: DiffRenderable | null) => void
	/** Clear cached renderables + applied colors. Call when opening a new diff view. */
	readonly resetDiffLineColors: () => void
}

/**
 * Owns diff comment line coloring: clear-then-reapply on selection or
 * view-mode change, with a layout-settle retry loop. The protocol lives
 * here so the rest of the codebase doesn't need to know about
 * applied-entry caching, context-key versioning, or the retry timeout.
 *
 * setDiffRenderableRef is the seam the diff renderer uses to register
 * itself per file index; on register it re-applies cached colors so a
 * remount-then-color sequence stays visually stable.
 */
export const useDiffLineColors = ({
	diffLineColorContextKey,
	effectiveDiffRenderView,
	selectedDiffCommentAnchor,
	selectedDiffCommentRangeAnchors,
	diffCommentThreadAnchors,
	suppressNextDiffCommentScrollRef,
	ensureDiffLineVisible,
}: UseDiffLineColorsInput): UseDiffLineColorsResult => {
	const diffRenderableRefs = useRef(new Map<number, DiffRenderable>())
	const diffCommentLineColorsRef = useRef<AppliedDiffLineColorState>({ contextKey: null, entries: [] })
	const diffLineColorRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(
		() => () => {
			if (diffLineColorRetryTimeoutRef.current !== null) clearTimeout(diffLineColorRetryTimeoutRef.current)
		},
		[],
	)

	useEffect(() => {
		const applyEntries = (entries: readonly AppliedDiffLineColor[]) => {
			for (const entry of entries) {
				const diff = diffRenderableRefs.current.get(entry.anchor.fileIndex)
				if (diff) setDiffCommentLineColor(diff, entry)
			}
		}

		const previous = diffCommentLineColorsRef.current
		const contextChanged = previous.contextKey !== diffLineColorContextKey
		if (previous.contextKey === diffLineColorContextKey) {
			for (const entry of previous.entries) {
				const diff = diffRenderableRefs.current.get(entry.anchor.fileIndex)
				if (diff) setDiffCommentLineColor(diff, { ...entry, color: originalDiffLineColor(entry.anchor) })
			}
		}

		const nextEntries: AppliedDiffLineColor[] = []
		const appliedKeys = new Set<string>()
		const applyLineColor = (anchor: StackedDiffCommentAnchor, color: DiffLineColorConfig, override = false) => {
			const key = `${effectiveDiffRenderView}:${anchor.fileIndex}:${anchor.side}:${anchor.renderLine}`
			if (appliedKeys.has(key) && !override) return
			appliedKeys.add(key)
			const entry = { anchor, view: effectiveDiffRenderView, color } satisfies AppliedDiffLineColor
			const diff = diffRenderableRefs.current.get(anchor.fileIndex)
			if (diff) setDiffCommentLineColor(diff, entry)
			if (!nextEntries.some((existing) => existing.view === entry.view && existing.anchor.side === anchor.side && existing.anchor.renderLine === anchor.renderLine)) {
				nextEntries.push(entry)
			}
		}

		for (const anchor of diffCommentThreadAnchors) {
			applyLineColor(anchor, diffCommentLineColor(anchor, "thread"))
		}
		if (selectedDiffCommentRangeAnchors.length > 0) {
			for (const anchor of selectedDiffCommentRangeAnchors) {
				applyLineColor(anchor, diffCommentLineColor(anchor, "range"), true)
			}
		}
		if (selectedDiffCommentAnchor) {
			applyLineColor(selectedDiffCommentAnchor, diffCommentLineColor(selectedDiffCommentAnchor, "selected"), true)
			if (suppressNextDiffCommentScrollRef.current) {
				suppressNextDiffCommentScrollRef.current = false
			} else {
				ensureDiffLineVisible(selectedDiffCommentAnchor.renderLine)
			}
		} else {
			suppressNextDiffCommentScrollRef.current = false
		}
		diffCommentLineColorsRef.current = { contextKey: diffLineColorContextKey, entries: nextEntries }
		if (contextChanged && diffLineColorRetryTimeoutRef.current !== null) clearTimeout(diffLineColorRetryTimeoutRef.current)
		if (contextChanged && diffLineColorContextKey && nextEntries.length > 0) {
			const contextKey = diffLineColorContextKey
			let attempts = 0
			const reapplyLineColors = () => {
				attempts++
				if (diffCommentLineColorsRef.current.contextKey !== contextKey) {
					diffLineColorRetryTimeoutRef.current = null
					return
				}
				applyEntries(diffCommentLineColorsRef.current.entries)
				if (attempts < DIFF_LINE_COLOR_REAPPLY_ATTEMPTS) {
					diffLineColorRetryTimeoutRef.current = globalThis.setTimeout(reapplyLineColors, DIFF_LAYOUT_RETRY_MS)
				} else {
					diffLineColorRetryTimeoutRef.current = null
				}
			}
			diffLineColorRetryTimeoutRef.current = globalThis.setTimeout(reapplyLineColors, DIFF_LAYOUT_RETRY_MS)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		selectedDiffCommentAnchor?.renderLine,
		selectedDiffCommentAnchor?.colorLine,
		selectedDiffCommentAnchor?.side,
		selectedDiffCommentAnchor?.fileIndex,
		selectedDiffCommentRangeAnchors,
		diffLineColorContextKey,
		effectiveDiffRenderView,
		diffCommentThreadAnchors,
	])

	const setDiffRenderableRef = (index: number, diff: DiffRenderable | null) => {
		if (diff) {
			diffRenderableRefs.current.set(index, diff)
			for (const entry of diffCommentLineColorsRef.current.entries) {
				if (entry.anchor.fileIndex === index) setDiffCommentLineColor(diff, entry)
			}
		} else {
			diffRenderableRefs.current.delete(index)
		}
	}

	const resetDiffLineColors = () => {
		diffRenderableRefs.current.clear()
		diffCommentLineColorsRef.current = { contextKey: null, entries: [] }
	}

	return { setDiffRenderableRef, resetDiffLineColors }
}
