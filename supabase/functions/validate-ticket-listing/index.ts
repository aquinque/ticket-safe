import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { eventName, school, campus, eventType, eventDate, originalPrice, sellingPrice, quantity, description } = await req.json();

    const errors: string[] = [];

    // Event name validation
    if (!eventName || typeof eventName !== 'string') {
      errors.push('Event name is required');
    } else if (eventName.trim().length === 0) {
      errors.push('Event name cannot be empty');
    } else if (eventName.length > 200) {
      errors.push('Event name must be less than 200 characters');
    }

    // School validation
    if (!school || typeof school !== 'string') {
      errors.push('School is required');
    } else if (school.trim().length === 0) {
      errors.push('School cannot be empty');
    } else if (school.length > 200) {
      errors.push('School name must be less than 200 characters');
    }

    // Campus validation - required for ESCP schools
    if (school && school.toLowerCase() === 'escp') {
      if (!campus || typeof campus !== 'string' || campus.trim().length === 0) {
        errors.push('Campus is required for ESCP');
      } else {
        // Validate campus against whitelist for ESCP
        const validCampuses = ['paris', 'turin', 'madrid', 'londres', 'london', 'berlin'];
        if (!validCampuses.includes(campus.toLowerCase())) {
          errors.push('Invalid campus for ESCP. Must be one of: Paris, Turin, Madrid, Londres, Berlin');
        }
      }
    } else if (campus && typeof campus === 'string') {
      if (campus.length > 200) {
        errors.push('Campus name must be less than 200 characters');
      }
    }

    // Event type validation
    if (!eventType || typeof eventType !== 'string') {
      errors.push('Event type is required');
    } else if (eventType.trim().length === 0) {
      errors.push('Event type cannot be empty');
    } else if (eventType.length > 100) {
      errors.push('Event type must be less than 100 characters');
    }

    // Event date validation
    if (!eventDate) {
      errors.push('Event date is required');
    } else {
      const date = new Date(eventDate);
      if (isNaN(date.getTime())) {
        errors.push('Invalid event date');
      } else if (date < new Date()) {
        errors.push('Event date must be in the future');
      }
    }

    // Original price validation
    const originalPriceNum = parseFloat(originalPrice);
    if (!originalPrice || isNaN(originalPriceNum)) {
      errors.push('Original price is required');
    } else if (originalPriceNum <= 0) {
      errors.push('Original price must be greater than 0');
    } else if (originalPriceNum > 10000) {
      errors.push('Original price must be less than 10,000');
    }

    // Selling price validation
    const sellingPriceNum = parseFloat(sellingPrice);
    if (!sellingPrice || isNaN(sellingPriceNum)) {
      errors.push('Selling price is required');
    } else if (sellingPriceNum <= 0) {
      errors.push('Selling price must be greater than 0');
    } else if (sellingPriceNum > 10000) {
      errors.push('Selling price must be less than 10,000');
    } else if (!isNaN(originalPriceNum)) {
      // Validate price range (50% to 150% of original)
      const minPrice = originalPriceNum * 0.5;
      const maxPrice = originalPriceNum * 1.5;
      
      if (sellingPriceNum < minPrice || sellingPriceNum > maxPrice) {
        errors.push(`Selling price must be between 50% and 150% of original price (£${minPrice.toFixed(2)} - £${maxPrice.toFixed(2)})`);
      }
    }

    // Quantity validation
    const quantityNum = parseInt(quantity);
    if (!quantity || isNaN(quantityNum)) {
      errors.push('Quantity is required');
    } else if (quantityNum < 1) {
      errors.push('Quantity must be at least 1');
    } else if (quantityNum > 100) {
      errors.push('Quantity must be less than 100');
    }

    // Description validation
    if (description && typeof description === 'string') {
      if (description.length > 1000) {
        errors.push('Description must be less than 1000 characters');
      }
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ valid: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ valid: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ valid: false, errors: [errorMessage] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});