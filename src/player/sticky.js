export function shouldStickPlayer( {
	trackCount,
	shellTop,
	panelTop,
	panelHeight,
	viewportHeight,
	bottomGap,
} ) {
	return (
		trackCount > 4 &&
		shellTop < viewportHeight - panelHeight - bottomGap &&
		panelTop + panelHeight > viewportHeight - bottomGap
	);
}
