import { InvoiceData, TemplateType } from '@invoice-monorepo/types';
import {
    corporateTemplate,
    receiptTemplate,
} from './templates';


export const templateInfo: Record<TemplateType, { name: string; description: string }> = {
    corporate: {
        name: 'Corporate',
        description: 'Professional corporate invoice template with comprehensive field mapping',
    },
    thermal: {
        name: 'Thermal Receipt',
        description: 'Compact 50 mm invoice for thermal receipt printers',
    },
};

export const generateInvoiceHtml = (
    data: InvoiceData,
    template: TemplateType
): string => {
    if (template === 'thermal' || data.config?.style === 'thermal' || data.config?.pageSize === 'Receipt') {
        return receiptTemplate(data);
    }

    return corporateTemplate(data);
};


