import antfu from '@antfu/eslint-config'

export default antfu({
	typescript: true,
	stylistic: {
		indent: 'tab',
		quotes: 'single',
	},
	ignores: [
		'**/dist/**',
		'**/node_modules/**',
		'bun.lock',
	],
})
