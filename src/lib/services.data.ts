// Service catalog for non-cabinet work (from the prototype). Rates are starting points; contractors edit them in Settings.
export type Service = { id:string; sqftPerUnit:number; short:string; unit:string; unitEs:string; en:string; es:string; rate:number };
export const SERVICES: Service[] = [
  {
    "id": "walls",
    "sqftPerUnit": 1,
    "short": "Walls",
    "unit": "sq ft",
    "unitEs": "pie²",
    "en": "Interior painting — walls",
    "es": "Pintura interior — paredes",
    "rate": 1.85
  },
  {
    "id": "ceiling",
    "sqftPerUnit": 1,
    "short": "Ceilings",
    "unit": "sq ft",
    "unitEs": "pie²",
    "en": "Ceilings — painted",
    "es": "Techos — pintados",
    "rate": 1.25
  },
  {
    "id": "base",
    "sqftPerUnit": 0.6,
    "short": "Baseboards",
    "unit": "lin ft",
    "unitEs": "pie lineal",
    "en": "Baseboards — painted",
    "es": "Rodapié — pintado",
    "rate": 2.5
  },
  {
    "id": "crown",
    "sqftPerUnit": 0.5,
    "short": "Crown",
    "unit": "lin ft",
    "unitEs": "pie lineal",
    "en": "Crown molding — painted",
    "es": "Molduras de corona — pintadas",
    "rate": 3.5
  },
  {
    "id": "doors",
    "sqftPerUnit": 40,
    "short": "Doors",
    "unit": "ea",
    "unitEs": "c/u",
    "en": "Interior doors and frames — painted",
    "es": "Puertas interiores y marcos — pintados",
    "rate": 85
  },
  {
    "id": "windows",
    "sqftPerUnit": 12,
    "short": "Windows",
    "unit": "ea",
    "unitEs": "c/u",
    "en": "Window trim — painted",
    "es": "Marcos de ventana — pintados",
    "rate": 45
  },
  {
    "id": "closet",
    "sqftPerUnit": 80,
    "short": "Closets",
    "unit": "ea",
    "unitEs": "c/u",
    "en": "Closet interior — painted",
    "es": "Interior de clóset — pintado",
    "rate": 150
  },
  {
    "id": "accent",
    "sqftPerUnit": 120,
    "short": "Accent wall",
    "unit": "ea",
    "unitEs": "c/u",
    "en": "Accent wall",
    "es": "Pared de acento",
    "rate": 250
  },
  {
    "id": "drywall",
    "sqftPerUnit": 10,
    "short": "Drywall",
    "unit": "ea",
    "unitEs": "c/u",
    "en": "Drywall repair and patching",
    "es": "Reparación de drywall y resanes",
    "rate": 75
  },
  {
    "id": "popcorn",
    "sqftPerUnit": 1,
    "short": "Popcorn",
    "unit": "sq ft",
    "unitEs": "pie²",
    "en": "Popcorn ceiling removal and finish",
    "es": "Remoción de textura popcorn y acabado",
    "rate": 2.25
  },
  {
    "id": "exterior",
    "sqftPerUnit": 1,
    "short": "Exterior",
    "unit": "sq ft",
    "unitEs": "pie²",
    "en": "Exterior walls / stucco — painted",
    "es": "Paredes exteriores / estuco — pintadas",
    "rate": 1.75
  },
  {
    "id": "gutters",
    "sqftPerUnit": 0.8,
    "short": "Gutters",
    "unit": "lin ft",
    "unitEs": "pie lineal",
    "en": "Exterior gutters — painted",
    "es": "Canaletas exteriores — pintadas",
    "rate": 3
  },
  {
    "id": "soffit",
    "sqftPerUnit": 1.5,
    "short": "Soffit",
    "unit": "lin ft",
    "unitEs": "pie lineal",
    "en": "Soffit and fascia — painted",
    "es": "Sofito y fascia — pintados",
    "rate": 3.5
  },
  {
    "id": "wash",
    "sqftPerUnit": 0,
    "short": "Pressure wash",
    "unit": "sq ft",
    "unitEs": "pie²",
    "en": "Pressure washing",
    "es": "Lavado a presión",
    "rate": 0.35
  },
  {
    "id": "counter",
    "sqftPerUnit": 0,
    "short": "Countertops",
    "unit": "job",
    "unitEs": "trabajo",
    "en": "Countertop replacement — supply and install",
    "es": "Reemplazo de countertop — material e instalación",
    "rate": 0
  }
];
