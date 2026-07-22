import { useState } from '@wordpress/element';
import { Button, Modal, TextareaControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * "Add/Edit lyrics" button + modal editor, shared by the single-track and
 * playlist blocks so the three call sites stay in sync.
 *
 * @param {Object}   props
 * @param {string}   props.value    Current lyrics text.
 * @param {Function} props.onChange Called with the new lyrics string.
 * @param {string}   [props.help]   Optional help text under the textarea
 *                                  (e.g. the shared-track save note).
 */
export default function LyricsEditor( { value, onChange, help } ) {
	const [ open, setOpen ] = useState( false );

	return (
		<>
			<Button
				variant="tertiary"
				className="jtpp-editor-lyrics-btn"
				onClick={ () => setOpen( true ) }
			>
				{ value
					? __( 'Edit lyrics', 'jt-practice-player' )
					: __( 'Add lyrics', 'jt-practice-player' ) }
			</Button>
			{ open && (
				<Modal
					title={ __( 'Track lyrics', 'jt-practice-player' ) }
					onRequestClose={ () => setOpen( false ) }
					size="medium"
				>
					<TextareaControl
						label={ __(
							'Paste or type the lyrics below. They will be shown to listeners via a button on the player.',
							'jt-practice-player'
						) }
						help={ help }
						__nextHasNoMarginBottom
						value={ value || '' }
						rows={ 16 }
						onChange={ onChange }
					/>
					<Button
						variant="primary"
						onClick={ () => setOpen( false ) }
					>
						{ __( 'Close', 'jt-practice-player' ) }
					</Button>
				</Modal>
			) }
		</>
	);
}
