import { Router, type IRouter } from 'express';
import { ShipFromAddressRepository } from '@unified/database';

const router: IRouter = Router();
const shipFromRepo = new ShipFromAddressRepository();

// Preset addresses for common fulfillment centers
const PRESET_ADDRESSES = {
  // Las Vegas locations
  'vegas-north': {
    name: 'Las Vegas North Fulfillment Center',
    company: 'Unified Shipping',
    street1: '4550 N Lamb Blvd',
    street2: 'Suite 100',
    city: 'Las Vegas',
    state: 'NV',
    zip: '89115',
    country: 'US',
    phone: '702-555-0101',
    email: 'vegas-north@unified.local',
  },
  'vegas-south': {
    name: 'Las Vegas South Warehouse',
    company: 'Unified Shipping',
    street1: '6625 S Valley View Blvd',
    street2: 'Building A',
    city: 'Las Vegas',
    state: 'NV',
    zip: '89118',
    country: 'US',
    phone: '702-555-0102',
    email: 'vegas-south@unified.local',
  },
  'vegas-henderson': {
    name: 'Henderson Distribution Center',
    company: 'Unified Shipping',
    street1: '2500 Wigwam Pkwy',
    street2: '',
    city: 'Henderson',
    state: 'NV',
    zip: '89074',
    country: 'US',
    phone: '702-555-0103',
    email: 'henderson@unified.local',
  },
  // Los Angeles locations
  'la-downtown': {
    name: 'Los Angeles Downtown Warehouse',
    company: 'Unified Shipping',
    street1: '1855 Industrial St',
    street2: 'Suite 200',
    city: 'Los Angeles',
    state: 'CA',
    zip: '90021',
    country: 'US',
    phone: '213-555-0201',
    email: 'la-downtown@unified.local',
  },
  'la-vernon': {
    name: 'Vernon Fulfillment Center',
    company: 'Unified Shipping',
    street1: '3750 Bandini Blvd',
    street2: '',
    city: 'Vernon',
    state: 'CA',
    zip: '90058',
    country: 'US',
    phone: '323-555-0202',
    email: 'vernon@unified.local',
  },
  'la-commerce': {
    name: 'Commerce Distribution Hub',
    company: 'Unified Shipping',
    street1: '5801 Rickenbacker Rd',
    street2: 'Building 5',
    city: 'Commerce',
    state: 'CA',
    zip: '90040',
    country: 'US',
    phone: '323-555-0203',
    email: 'commerce@unified.local',
  },
  'la-long-beach': {
    name: 'Long Beach Port Warehouse',
    company: 'Unified Shipping',
    street1: '2201 E Wardlow Rd',
    street2: '',
    city: 'Long Beach',
    state: 'CA',
    zip: '90807',
    country: 'US',
    phone: '562-555-0204',
    email: 'long-beach@unified.local',
  },
  'la-ontario': {
    name: 'Ontario Logistics Center',
    company: 'Unified Shipping',
    street1: '4350 E Jurupa St',
    street2: 'Suite A',
    city: 'Ontario',
    state: 'CA',
    zip: '91761',
    country: 'US',
    phone: '909-555-0205',
    email: 'ontario@unified.local',
  },
};

/**
 * GET /api/ship-from/presets
 * Get list of preset addresses
 */
router.get('/presets', async (_req, res) => {
  try {
    const presets = Object.entries(PRESET_ADDRESSES).map(([key, address]) => ({
      key,
      ...address,
    }));

    res.json({
      success: true,
      data: presets,
    });
  } catch (error: any) {
    console.error('Get presets error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_PRESETS_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * POST /api/ship-from
 * Create a new ship-from address
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.body.userId || '00000000-0000-0000-0000-000000000000';
    const addressData = req.body;

    const address = await shipFromRepo.create(userId, addressData);

    res.json({
      success: true,
      data: address,
    });
  } catch (error: any) {
    console.error('Create ship-from address error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * POST /api/ship-from/preset/:presetKey
 * Create a ship-from address from a preset
 */
router.post('/preset/:presetKey', async (req, res) => {
  try {
    const { presetKey } = req.params;
    const userId = req.body.userId || '00000000-0000-0000-0000-000000000000';
    const isDefault = req.body.isDefault || false;

    const presetAddress = PRESET_ADDRESSES[presetKey as keyof typeof PRESET_ADDRESSES];

    if (!presetAddress) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRESET_NOT_FOUND',
          message: `Preset address '${presetKey}' not found`,
        },
      });
    }

    const address = await shipFromRepo.create(userId, {
      ...presetAddress,
      isDefault,
    });

    res.json({
      success: true,
      data: address,
    });
  } catch (error: any) {
    console.error('Create from preset error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_PRESET_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/ship-from
 * Get all ship-from addresses for a user
 */
router.get('/', async (req, res) => {
  try {
    const userId = (req.query.userId as string) || '00000000-0000-0000-0000-000000000000';
    const addresses = await shipFromRepo.findByUserId(userId);

    res.json({
      success: true,
      data: addresses,
    });
  } catch (error: any) {
    console.error('Get ship-from addresses error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/ship-from/default
 * Get default ship-from address for a user
 */
router.get('/default', async (req, res) => {
  try {
    const userId = (req.query.userId as string) || '00000000-0000-0000-0000-000000000000';
    const address = await shipFromRepo.findDefault(userId);

    if (!address) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No default address found',
        },
      });
    }

    res.json({
      success: true,
      data: address,
    });
  } catch (error: any) {
    console.error('Get default address error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_DEFAULT_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/ship-from/:id
 * Get a specific ship-from address
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const address = await shipFromRepo.findById(id);

    if (!address) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Address not found',
        },
      });
    }

    res.json({
      success: true,
      data: address,
    });
  } catch (error: any) {
    console.error('Get ship-from address error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * PUT /api/ship-from/:id
 * Update a ship-from address
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const address = await shipFromRepo.update(id, updates);

    if (!address) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Address not found',
        },
      });
    }

    res.json({
      success: true,
      data: address,
    });
  } catch (error: any) {
    console.error('Update ship-from address error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * PUT /api/ship-from/:id/set-default
 * Set an address as default
 */
router.put('/:id/set-default', async (req, res) => {
  try {
    const { id } = req.params;
    const address = await shipFromRepo.setDefault(id);

    if (!address) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Address not found',
        },
      });
    }

    res.json({
      success: true,
      data: address,
    });
  } catch (error: any) {
    console.error('Set default address error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SET_DEFAULT_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * DELETE /api/ship-from/:id
 * Delete a ship-from address
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await shipFromRepo.delete(id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Address not found',
        },
      });
    }

    res.json({
      success: true,
      data: { message: 'Address deleted successfully' },
    });
  } catch (error: any) {
    console.error('Delete ship-from address error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: error.message,
      },
    });
  }
});

export { router as shipFromRouter };
