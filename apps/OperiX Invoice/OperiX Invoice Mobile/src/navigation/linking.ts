import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

const linkDomain = process.env.EXPO_PUBLIC_OPERIX_INVOICE_LINK_DOMAIN?.trim() || 'invoice.operixsuite.com';
const webPrefix = `https://${linkDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

/** Universal Links/App Links plus the existing Expo scheme fallback. */
export const invoiceLinking: LinkingOptions<RootStackParamList> = {
    prefixes: [webPrefix, 'operix-invoice://'],
    config: {
        screens: {
            InvoiceDetail: 'open/invoices/:invoiceId',
            CustomerDetail: 'open/customers/:clientId',
            ProductDetail: 'open/products/:productId',
            PaymentForm: 'open/payments/:paymentId',
            ExpenseForm: 'open/expenses/:expenseId',
        },
    },
};
