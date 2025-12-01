import { Router, type IRouter } from 'express';
import { createProvidersFromEnv, N8nProvider } from '@unified/shipping-providers';
import { shippingEnv } from '@unified/env';
import { ShipFromAddressRepository } from '@unified/database';
import type { RateRequest, LabelRequest } from '@unified/types';

const router: IRouter = Router();
const shipFromRepo = new ShipFromAddressRepository();

// Initialize providers
const providers = createProvidersFromEnv();

/**
 * POST /api/shipping/intake
 * Submit a delivery request intake form
 */
router.post('/intake', async (req, res) => {
  try {
    const n8nProvider = providers.get('n8n') as N8nProvider | undefined;

    if (!n8nProvider) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PROVIDER_NOT_CONFIGURED',
          message: 'N8n provider not configured',
        },
      });
    }

    const result = await n8nProvider.submitIntake(req.body);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Intake error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTAKE_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * POST /api/shipping/rates
 * Get shipping rates from all configured providers
 */
router.post('/rates', async (req, res) => {
  try {
    const request: RateRequest = req.body;
    const { provider: preferredProvider } = req.query;

    // If originId is provided, fetch the ship-from address
    if (request.originId && !request.origin) {
      const shipFromAddress = await shipFromRepo.findById(request.originId);
      if (!shipFromAddress) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SHIP_FROM_NOT_FOUND',
            message: `Ship-from address with ID ${request.originId} not found`,
          },
        });
      }
      request.origin = {
        name: shipFromAddress.name,
        company: shipFromAddress.company,
        street1: shipFromAddress.street1,
        street2: shipFromAddress.street2,
        city: shipFromAddress.city,
        state: shipFromAddress.state,
        zip: shipFromAddress.zip,
        country: shipFromAddress.country,
        phone: shipFromAddress.phone,
        email: shipFromAddress.email,
      };
    }

    // If no origin provided, try to get the default address
    if (!request.origin) {
      const userId = req.body.userId || '00000000-0000-0000-0000-000000000000';
      const defaultAddress = await shipFromRepo.findDefault(userId);
      if (defaultAddress) {
        request.origin = {
          name: defaultAddress.name,
          company: defaultAddress.company,
          street1: defaultAddress.street1,
          street2: defaultAddress.street2,
          city: defaultAddress.city,
          state: defaultAddress.state,
          zip: defaultAddress.zip,
          country: defaultAddress.country,
          phone: defaultAddress.phone,
          email: defaultAddress.email,
        };
      }
    }

    if (!request.origin) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ORIGIN_REQUIRED',
          message:
            'Origin address is required. Provide either origin or originId, or set a default ship-from address.',
        },
      });
    }

    // Optional address validation preflight (remote via provider)
    const doValidate = shippingEnv.validation.mode !== 'off';
    if (doValidate) {
      const easypost = providers.get('easypost');
      const validationProvider =
        easypost ||
        Array.from(providers.values()).find(
          (p) => typeof (p as any).validateAddress === 'function',
        );
      if (validationProvider && request.origin && request.destination) {
        const [ov, dv] = await Promise.all([
          (validationProvider as any).validateAddress(request.origin),
          (validationProvider as any).validateAddress(request.destination),
        ]);
        const issues: string[] = [];
        if (!ov.valid) issues.push(...(ov.errors || []).map((e: string) => `origin: ${e}`));
        if (!dv.valid) issues.push(...(dv.errors || []).map((e: string) => `destination: ${e}`));
        if (issues.length) {
          if (shippingEnv.validation.autofix && ov.suggested && dv.suggested) {
            request.origin = ov.suggested;
            request.destination = dv.suggested;
          } else {
            return res.status(400).json({
              success: false,
              error: {
                code: 'ADDRESS_INVALID',
                message: 'Address validation failed',
                details: issues,
              },
            });
          }
        }
      }
    }

    const allRates: any[] = [];
    const errors: any[] = [];

    // Get rates from specified provider or all providers
    const providersToQuery = preferredProvider
      ? [providers.get(preferredProvider as string)].filter(Boolean)
      : Array.from(providers.values());

    await Promise.all(
      providersToQuery.map(async (provider) => {
        if (!provider) return;

        try {
          const rates = await provider.getRates(request);
          allRates.push(...rates);
        } catch (err: any) {
          errors.push({
            provider: provider.name,
            error: err.message,
          });
        }
      }),
    );

    res.json({
      success: true,
      data: {
        rates: allRates.sort((a, b) => a.cost - b.cost),
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error: any) {
    console.error('Rates error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RATES_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * POST /api/shipping/book
 * Book a shipment and create a label
 */
router.post('/book', async (req, res) => {
  try {
    const request: LabelRequest = req.body;
    const providerName = request.rate?.provider?.toLowerCase();

    // If originId is provided, fetch the ship-from address
    if (request.originId && !request.origin) {
      const shipFromAddress = await shipFromRepo.findById(request.originId);
      if (!shipFromAddress) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SHIP_FROM_NOT_FOUND',
            message: `Ship-from address with ID ${request.originId} not found`,
          },
        });
      }
      request.origin = {
        name: shipFromAddress.name,
        company: shipFromAddress.company,
        street1: shipFromAddress.street1,
        street2: shipFromAddress.street2,
        city: shipFromAddress.city,
        state: shipFromAddress.state,
        zip: shipFromAddress.zip,
        country: shipFromAddress.country,
        phone: shipFromAddress.phone,
        email: shipFromAddress.email,
      };
    }

    // If no origin provided, try to get the default address
    if (!request.origin) {
      const userId = req.body.userId || '00000000-0000-0000-0000-000000000000';
      const defaultAddress = await shipFromRepo.findDefault(userId);
      if (defaultAddress) {
        request.origin = {
          name: defaultAddress.name,
          company: defaultAddress.company,
          street1: defaultAddress.street1,
          street2: defaultAddress.street2,
          city: defaultAddress.city,
          state: defaultAddress.state,
          zip: defaultAddress.zip,
          country: defaultAddress.country,
          phone: defaultAddress.phone,
          email: defaultAddress.email,
        };
      }
    }

    if (!request.origin) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ORIGIN_REQUIRED',
          message:
            'Origin address is required. Provide either origin or originId, or set a default ship-from address.',
        },
      });
    }

    const provider = providerName ? providers.get(providerName) : providers.values().next().value;

    if (!provider) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PROVIDER_NOT_FOUND',
          message: `Provider ${providerName || 'default'} not configured`,
        },
      });
    }

    // Optional address validation preflight before booking
    const doValidate = shippingEnv.validation.mode !== 'off';
    if (
      doValidate &&
      request.origin &&
      request.destination &&
      typeof (provider as any).validateAddress === 'function'
    ) {
      const [ov, dv] = await Promise.all([
        (provider as any).validateAddress(request.origin),
        (provider as any).validateAddress(request.destination),
      ]);
      const issues: string[] = [];
      if (!ov.valid) issues.push(...(ov.errors || []).map((e: string) => `origin: ${e}`));
      if (!dv.valid) issues.push(...(dv.errors || []).map((e: string) => `destination: ${e}`));
      if (issues.length) {
        if (shippingEnv.validation.autofix && ov.suggested && dv.suggested) {
          request.origin = ov.suggested;
          request.destination = dv.suggested;
        } else {
          return res.status(400).json({
            success: false,
            error: {
              code: 'ADDRESS_INVALID',
              message: 'Address validation failed',
              details: issues,
            },
          });
        }
      }
    }

    const label = await provider.createLabel(request);

    res.json({
      success: true,
      data: label,
    });
  } catch (error: any) {
    console.error('Book error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BOOK_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/shipping/track/:trackingNumber
 * Track a shipment
 */
router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { provider: providerName } = req.query;

    const provider = providerName
      ? providers.get(providerName as string)
      : providers.values().next().value;

    if (!provider) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PROVIDER_NOT_FOUND',
          message: 'No shipping provider configured',
        },
      });
    }

    const tracking = await provider.trackShipment(trackingNumber);

    res.json({
      success: true,
      data: tracking,
    });
  } catch (error: any) {
    console.error('Track error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TRACK_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * POST /api/shipping/validate-address
 * Validate a shipping address
 */
router.post('/validate-address', async (req, res) => {
  try {
    const { address, provider: providerName } = req.body;

    const provider = providerName
      ? providers.get(providerName)
      : providers.get('easypost') || providers.values().next().value;

    if (!provider) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PROVIDER_NOT_FOUND',
          message: 'No shipping provider configured for address validation',
        },
      });
    }

    const result = await provider.validateAddress(address);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Address validation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
      },
    });
  }
});

/**
 * DELETE /api/shipping/:shipmentId
 * Cancel a shipment
 */
router.delete('/:shipmentId', async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { provider: providerName } = req.query;

    const provider = providerName
      ? providers.get(providerName as string)
      : providers.values().next().value;

    if (!provider) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PROVIDER_NOT_FOUND',
          message: 'No shipping provider configured',
        },
      });
    }

    await provider.cancelShipment(shipmentId);

    res.json({
      success: true,
      data: { message: 'Shipment cancelled successfully' },
    });
  } catch (error: any) {
    console.error('Cancel error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CANCEL_ERROR',
        message: error.message,
      },
    });
  }
});

export { router as shippingRouter };
