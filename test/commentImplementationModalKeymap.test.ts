import { describe, expect, test } from "bun:test"
import { createDispatcher, parseKey } from "@ghui/keymap"
import { commentImplementationModalKeymap } from "../src/keymap/commentImplementationModal.ts"

describe("commentImplementationModalKeymap", () => {
	test("supports close, confirm, copy, and scroll keys", () => {
		const log: string[] = []
		const dispatcher = createDispatcher(commentImplementationModalKeymap, () => ({
			halfPage: 10,
			closeModal: () => log.push("close"),
			confirm: () => log.push("confirm"),
			copy: () => log.push("copy"),
			scrollBy: (delta: number) => log.push(`scroll:${delta}`),
		}))

		dispatcher.dispatch(parseKey("j"))
		dispatcher.dispatch(parseKey("k"))
		dispatcher.dispatch(parseKey("ctrl+d"))
		dispatcher.dispatch(parseKey("y"))
		dispatcher.dispatch(parseKey("return"))
		dispatcher.dispatch(parseKey("escape"))

		expect(log).toEqual(["scroll:1", "scroll:-1", "scroll:10", "copy", "confirm", "close"])
	})
})
