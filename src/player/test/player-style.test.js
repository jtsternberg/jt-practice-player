import fs from 'fs';
import path from 'path';

describe( 'mobile player panel spacing', () => {
	it( 'overrides the playlist panel selector with horizontal padding on phones', () => {
		const scss = fs.readFileSync(
			path.resolve( __dirname, '../player.scss' ),
			'utf8'
		);

		expect( scss ).toMatch(
			/@media \(max-width: 520px\)[\s\S]*?\.jtpp-shell \.jtpp-panel\s*\{[\s\S]*?padding:\s*12px;/
		);
	} );
} );
