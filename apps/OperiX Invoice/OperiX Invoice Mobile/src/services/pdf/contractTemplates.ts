import { Contract, Client, Profile } from '@invoice-monorepo/types';
import { t, type AppLocale } from '@invoice-monorepo/i18n';
import { normalizeBrandColor } from '../../theme/brand';

interface ContractPDFData {
    contract: Contract;
    client: Client | null;
    profile: Profile;
    language?: AppLocale;
}

export function generateServiceAgreementHTML(data: ContractPDFData): string {
    const { contract, client, profile } = data;
    const language = data.language || 'en';
    const content = contract.content || {};
    const today = new Date(contract.created_at).toLocaleDateString(language === 'sq' ? 'sq-XK' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const primaryColor = normalizeBrandColor(profile.primary_color);

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Helvetica Neue', Arial, sans-serif; 
            line-height: 1.6; 
            color: #1e293b;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
        }
        .header { 
            text-align: center; 
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 3px solid ${primaryColor};
        }
        .header h1 { 
            font-size: 28px; 
            color: ${primaryColor};
            margin-bottom: 8px;
        }
        .header .subtitle {
            color: #64748b;
            font-size: 14px;
        }
        .parties {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            gap: 40px;
        }
        .party {
            flex: 1;
            padding: 20px;
            background: #F7F9FC;
            border-radius: 8px;
        }
        .party-label {
            font-size: 12px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .party-name {
            font-size: 18px;
            font-weight: bold;
            color: #1e293b;
            margin-bottom: 4px;
        }
        .party-details {
            font-size: 14px;
            color: #64748b;
        }
        .section {
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 16px;
            font-weight: bold;
            color: ${primaryColor};
            border-bottom: 2px solid ${primaryColor};
            padding-bottom: 8px;
            margin-bottom: 16px;
        }
        .section-content {
            font-size: 14px;
            color: #334155;
        }
        .terms {
            background: #F7F9FC;
            padding: 20px;
            border-radius: 8px;
            font-size: 13px;
            color: #475569;
        }
        .terms p {
            margin-bottom: 12px;
        }
        .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 60px;
            gap: 40px;
        }
        .signature-box {
            flex: 1;
            text-align: center;
        }
        .signature-line {
            border-bottom: 2px solid #1e293b;
            height: 80px;
            margin-bottom: 8px;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            padding-bottom: 8px;
        }
        .signature-line img {
            max-height: 70px;
            max-width: 100%;
        }
        .signature-label {
            font-size: 14px;
            color: #64748b;
        }
        .signature-name {
            font-size: 14px;
            font-weight: bold;
            margin-top: 4px;
        }
        .date-line {
            margin-top: 20px;
            font-size: 12px;
            color: #64748b;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #E6EBF1;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${contract.title}</h1>
        <div class="subtitle">${t('serviceAgreement', language)} • ${today}</div>
    </div>

    <div class="parties">
        <div class="party">
            <div class="party-label">${t('serviceProvider', language)}</div>
            <div class="party-name">${profile.company_name || t('provider', language)}</div>
            <div class="party-details">
                ${profile.address || ''}<br>
                ${profile.email || ''}<br>
                ${profile.tax_id ? `${t('taxIdLabel', language)}: ${profile.tax_id}` : ''}
            </div>
        </div>
        <div class="party">
            <div class="party-label">${t('client', language)}</div>
            <div class="party-name">${client?.name || t('client', language)}</div>
            <div class="party-details">
                ${client?.address || ''}<br>
                ${client?.email || ''}<br>
                ${client?.tax_id ? `${t('taxIdLabel', language)}: ${client.tax_id}` : ''}
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">1. ${t('scopeOfServices', language)}</div>
        <div class="section-content">
            ${content.scope || t('servicesAgreed', language)}
        </div>
    </div>

    <div class="section">
        <div class="section-title">2. ${t('paymentTerms', language)}</div>
        <div class="section-content">
            ${content.paymentTerms || t('paymentTermsAgreed', language)}
        </div>
    </div>

    <div class="section">
        <div class="section-title">3. ${t('timeline', language)}</div>
        <div class="section-content">
            ${content.timeline || t('projectTimeline', language)}
        </div>
    </div>

    <div class="section">
        <div class="section-title">4. ${t('generalTerms', language)}</div>
        <div class="terms">
            <p><strong>${t('confidentiality', language)}:</strong> ${t('confidentialityText', language)}</p>
            <p><strong>${t('intellectualProperty', language)}:</strong> ${t('intellectualPropertyText', language)}</p>
            <p><strong>${t('termination', language)}:</strong> ${t('terminationText', language)}</p>
            <p><strong>${t('liability', language)}:</strong> ${t('liabilityText', language)}</p>
            <p><strong>${t('governingLaw', language)}:</strong> ${t('governingLawText', language)}</p>
        </div>
    </div>

    <div class="signatures">
        <div class="signature-box">
            <div class="signature-line">
                ${contract.signature_url ? `<img src="${contract.signature_url}" alt="${t('serviceProviderSignature', language)}">` : ''}
            </div>
            <div class="signature-label">${t('serviceProviderSignature', language)}</div>
            <div class="signature-name">${profile.company_name || ''}</div>
            <div class="date-line">${t('dateLabel', language)}: _______________</div>
        </div>
        <div class="signature-box">
            <div class="signature-line">
                ${contract.counterparty_signature_url ? `<img src="${contract.counterparty_signature_url}" alt="${t('clientSignature', language)}">` : ''}
            </div>
            <div class="signature-label">${t('clientSignature', language)}</div>
            <div class="signature-name">${client?.name || ''}</div>
            <div class="date-line">${t('dateLabel', language)}: _______________</div>
        </div>
    </div>

    <div class="footer">
        ${t('contractId', language)}: ${contract.id}<br>
        ${t('generatedOn', language)} ${new Date().toLocaleDateString(language === 'sq' ? 'sq-XK' : 'en-US')}
    </div>
</body>
</html>
    `;
}

export function generateNDAHTML(data: ContractPDFData): string {
    const { contract, client, profile } = data;
    const language = data.language || 'en';
    const content = contract.content || {};
    const today = new Date(contract.created_at).toLocaleDateString(language === 'sq' ? 'sq-XK' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const primaryColor = normalizeBrandColor(profile.primary_color);

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Helvetica Neue', Arial, sans-serif; 
            line-height: 1.6; 
            color: #1e293b;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
        }
        .header { 
            text-align: center; 
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 3px solid ${primaryColor};
        }
        .header h1 { 
            font-size: 28px; 
            color: ${primaryColor};
            margin-bottom: 8px;
        }
        .header .subtitle {
            color: #64748b;
            font-size: 14px;
        }
        .parties {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            gap: 40px;
        }
        .party {
            flex: 1;
            padding: 20px;
            background: #F7F9FC;
            border-radius: 8px;
        }
        .party-label {
            font-size: 12px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .party-name {
            font-size: 18px;
            font-weight: bold;
            color: #1e293b;
            margin-bottom: 4px;
        }
        .party-details {
            font-size: 14px;
            color: #64748b;
        }
        .section {
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 16px;
            font-weight: bold;
            color: ${primaryColor};
            border-bottom: 2px solid ${primaryColor};
            padding-bottom: 8px;
            margin-bottom: 16px;
        }
        .section-content {
            font-size: 14px;
            color: #334155;
        }
        .terms {
            background: #F7F9FC;
            padding: 20px;
            border-radius: 8px;
            font-size: 13px;
            color: #475569;
        }
        .terms p {
            margin-bottom: 12px;
        }
        .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 60px;
            gap: 40px;
        }
        .signature-box {
            flex: 1;
            text-align: center;
        }
        .signature-line {
            border-bottom: 2px solid #1e293b;
            height: 80px;
            margin-bottom: 8px;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            padding-bottom: 8px;
        }
        .signature-line img {
            max-height: 70px;
            max-width: 100%;
        }
        .signature-label {
            font-size: 14px;
            color: #64748b;
        }
        .signature-name {
            font-size: 14px;
            font-weight: bold;
            margin-top: 4px;
        }
        .date-line {
            margin-top: 20px;
            font-size: 12px;
            color: #64748b;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #E6EBF1;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${t('nonDisclosureAgreement', language)}</h1>
        <div class="subtitle">${t('confidentialityAgreement', language)} • ${today}</div>
    </div>

    <div class="parties">
        <div class="party">
            <div class="party-label">${t('disclosingParty', language)}</div>
            <div class="party-name">${profile.company_name || t('disclosingParty', language)}</div>
            <div class="party-details">
                ${profile.address || ''}<br>
                ${profile.email || ''}
            </div>
        </div>
        <div class="party">
            <div class="party-label">${t('receivingParty', language)}</div>
            <div class="party-name">${client?.name || t('receivingParty', language)}</div>
            <div class="party-details">
                ${client?.address || ''}<br>
                ${client?.email || ''}
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">1. ${t('definitionConfidentialInfo', language)}</div>
        <div class="section-content">
            ${content.confidentialInfo || t('confidentialInfoDefault', language)}
        </div>
    </div>

    <div class="section">
        <div class="section-title">2. ${t('durationConfidentiality', language)}</div>
        <div class="section-content">
            ${t('durationText', language)} <strong>${content.duration || t('durationConfidentialityPlaceholder', language)}</strong>.
        </div>
    </div>

    <div class="section">
        <div class="section-title">3. ${t('obligations', language)}</div>
        <div class="terms">
            <p>${t('receivingPartyAgrees', language)}</p>
            <p>• ${t('holdConfidential', language)}</p>
            <p>• ${t('noDisclose', language)}</p>
            <p>• ${t('useSolely', language)}</p>
            <p>• ${t('protectSecrecy', language)}</p>
            <p>• ${t('notifyUnauthorized', language)}</p>
        </div>
    </div>

    <div class="section">
        <div class="section-title">4. ${t('exclusions', language)}</div>
        <div class="terms">
            <p>${t('agreementDoesNotApply', language)}</p>
            <p>• ${t('publicInfo', language)}</p>
            <p>• ${t('priorPossession', language)}</p>
            <p>• ${t('independentlyDeveloped', language)}</p>
            <p>• ${t('requiredByLaw', language)}</p>
        </div>
    </div>

    <div class="signatures">
        <div class="signature-box">
            <div class="signature-line">
                ${contract.signature_url ? `<img src="${contract.signature_url}" alt="${t('disclosingParty', language)}">` : ''}
            </div>
            <div class="signature-label">${t('disclosingParty', language)} · ${t('signature', language)}</div>
            <div class="signature-name">${profile.company_name || ''}</div>
            <div class="date-line">${t('dateLabel', language)}: _______________</div>
        </div>
        <div class="signature-box">
            <div class="signature-line">
                ${contract.counterparty_signature_url ? `<img src="${contract.counterparty_signature_url}" alt="${t('receivingParty', language)}">` : ''}
            </div>
            <div class="signature-label">${t('receivingParty', language)} · ${t('signature', language)}</div>
            <div class="signature-name">${client?.name || ''}</div>
            <div class="date-line">${t('dateLabel', language)}: _______________</div>
        </div>
    </div>

    <div class="footer">
        ${t('contractId', language)}: ${contract.id}<br>
        ${t('generatedOn', language)} ${new Date().toLocaleDateString(language === 'sq' ? 'sq-XK' : 'en-US')}
    </div>
</body>
</html>
    `;
}

export function generateContractHTML(data: ContractPDFData): string {
    const { contract } = data;

    if (contract.type === 'nda') {
        return generateNDAHTML(data);
    }

    // Default to service agreement
    return generateServiceAgreementHTML(data);
}



