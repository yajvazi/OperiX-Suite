import { InvoiceData, TemplateType } from '@invoice-monorepo/types';
import type { TranslationKey } from '@invoice-monorepo/i18n';
import {
    corporateTemplate,
    receiptTemplate,
} from './templates';
import { formatPdfDate } from './dateFormatting';


export const templateInfo: Record<TemplateType, { nameKey: TranslationKey; descriptionKey: TranslationKey }> = {
    corporate: {
        nameKey: 'corporateTemplate',
        descriptionKey: 'corporateTemplateDescription',
    },
    thermal: {
        nameKey: 'thermalReceiptTemplate',
        descriptionKey: 'thermalReceiptTemplateDescription',
    },
};

export const generateInvoiceHtml = (
    data: InvoiceData,
    template: TemplateType
): string => {
    const pdfData: InvoiceData = {
        ...data,
        details: {
            ...data.details,
            issueDate: formatPdfDate(data.details.issueDate),
            dueDate: formatPdfDate(data.details.dueDate),
        },
    };

    if (template === 'thermal' || data.config?.style === 'thermal' || data.config?.pageSize === 'Receipt') {
        return receiptTemplate(pdfData);
    }

    return corporateTemplate(pdfData);
};
