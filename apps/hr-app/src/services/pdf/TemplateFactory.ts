import { InvoiceData, TemplateType } from '@invoice-monorepo/types';
import {
    corporateTemplate,
} from './templates';


export const templateInfo: Record<TemplateType, { name: string; description: string }> = {
    corporate: {
        name: 'Corporate',
        description: 'Professional corporate invoice template with comprehensive field mapping',
    },
    thermal: {
        name: 'Thermal',
        description: 'Compact receipt-style invoice template for thermal printers',
    },
};

export const generateInvoiceHtml = (
    data: InvoiceData,
    template: TemplateType
): string => {
    // Only support corporate
    return corporateTemplate(data);
};




