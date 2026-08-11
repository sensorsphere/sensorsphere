-- ============================================================================
-- SensorSphere Demo Seed
-- ============================================================================

INSERT INTO locations (
	    id,
	    parent_id,
	    type,
	    name,
	    metadata
)
VALUES

(
	'11111111-1111-1111-1111-111111111111',
	NULL,
	'SITE',
	'Maison',
	'{}'
)

ON CONFLICT DO NOTHING;

INSERT INTO locations (

	id,

	parent_id,

	type,

	name,

	metadata

)

VALUES

(
	'22222222-2222-2222-2222-222222222222',

	'11111111-1111-1111-1111-111111111111',

	'FLOOR',

	'RDC',

	'{}'

),

(
	'33333333-3333-3333-3333-333333333333',

	'11111111-1111-1111-1111-111111111111',

	'FLOOR',

	'Étage',

	'{}'

)

ON CONFLICT DO NOTHING;
