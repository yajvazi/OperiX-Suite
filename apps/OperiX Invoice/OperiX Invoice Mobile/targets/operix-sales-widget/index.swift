import AppIntents
import SwiftUI
import WidgetKit

private let operixAppGroup = "group.com.lrdygroup.operixinvoice"
private let operixWidgetKind = "OperixSalesWidget"

struct OperixWidgetTenant: AppEntity, Identifiable, Hashable {
    let id: String
    let name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Tenant"
    static var defaultQuery = OperixWidgetTenantQuery()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

struct OperixWidgetTenantQuery: EntityQuery {
    func entities(for identifiers: [OperixWidgetTenant.ID]) async throws -> [OperixWidgetTenant] {
        let tenants = OperixWidgetStore.tenants()
        return tenants.filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [OperixWidgetTenant] {
        OperixWidgetStore.tenants()
    }

    func defaultResult() async -> OperixWidgetTenant? {
        OperixWidgetStore.tenants().first
    }
}

struct OperixSalesWidgetConfiguration: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "OperiX sales widget"
    static var description = IntentDescription("Choose which tenant's daily sales to display.")

    @Parameter(title: "Tenant")
    var tenant: OperixWidgetTenant?
}

private struct StoredTenant: Decodable {
    let id: String
    let name: String
}

private struct StoredTenantSales: Decodable {
    let tenantId: String
    let tenantName: String
    let date: String
    let currency: String
    let sales: Double
    let orders: Int

    private enum CodingKeys: String, CodingKey {
        case tenantId, tenantName, id, name, date, currency, sales, orders
    }

    // Accepts both the current field names (tenantId/tenantName) and the older ones (id/name),
    // so numbers written by an older app build are still shown.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let id = try container.decodeIfPresent(String.self, forKey: .tenantId) ?? container.decode(String.self, forKey: .id)
        tenantId = id
        tenantName = try container.decodeIfPresent(String.self, forKey: .tenantName)
            ?? container.decodeIfPresent(String.self, forKey: .name) ?? "OperiX"
        date = try container.decode(String.self, forKey: .date)
        currency = try container.decodeIfPresent(String.self, forKey: .currency) ?? "EUR"
        sales = try container.decodeIfPresent(Double.self, forKey: .sales) ?? 0
        orders = try container.decodeIfPresent(Int.self, forKey: .orders) ?? 0
    }
}

private struct StoredSalesSnapshot: Decodable {
    let updatedAt: String
    let defaultTenantId: String?
    let tenants: [String: StoredTenantSales]
}

private struct OperixSalesEntry: TimelineEntry {
    let date: Date
    let tenantName: String
    let currency: String
    let sales: Double
    let orders: Int
    let salesDate: String
    let hasData: Bool

    var formattedSales: String {
        sales.formatted(.currency(code: currency))
    }
}

/// "yyyy-MM-dd" for the device's current day, the same format the app writes into the snapshot.
private func operixDayKey(_ date: Date) -> String {
    let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04ld-%02ld-%02ld", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
}

private enum OperixWidgetStore {
    private static let defaults = UserDefaults(suiteName: operixAppGroup)
    private static let tenantsKey = "operix.widget.tenants"
    private static let snapshotKey = "operix.widget.sales.snapshot"

    static func tenants() -> [OperixWidgetTenant] {
        guard
            let raw = defaults?.string(forKey: tenantsKey),
            let data = raw.data(using: .utf8),
            let stored = try? JSONDecoder().decode([StoredTenant].self, from: data)
        else {
            return []
        }
        return stored.map { OperixWidgetTenant(id: $0.id, name: $0.name) }
    }

    static func sales(for tenantId: String?) -> StoredTenantSales? {
        guard
            let raw = defaults?.string(forKey: snapshotKey),
            let data = raw.data(using: .utf8),
            let snapshot = try? JSONDecoder().decode(StoredSalesSnapshot.self, from: data)
        else {
            return nil
        }

        let selectedId = tenantId ?? snapshot.defaultTenantId
        guard let selectedId else { return nil }
        return snapshot.tenants[selectedId]
    }
}

private struct OperixSalesProvider: AppIntentTimelineProvider {
    typealias Entry = OperixSalesEntry
    typealias Intent = OperixSalesWidgetConfiguration

    func placeholder(in context: Context) -> OperixSalesEntry {
        OperixSalesEntry(
            date: Date(),
            tenantName: "OperiX",
            currency: "EUR",
            sales: 0,
            orders: 0,
            salesDate: "Today",
            hasData: true
        )
    }

    func snapshot(for configuration: OperixSalesWidgetConfiguration, in context: Context) async -> OperixSalesEntry {
        makeEntry(for: configuration.tenant?.id, at: Date())
    }

    func timeline(for configuration: OperixSalesWidgetConfiguration, in context: Context) async -> Timeline<OperixSalesEntry> {
        let now = Date()
        let calendar = Calendar.current
        let tenantId = configuration.tenant?.id
        var entries = [makeEntry(for: tenantId, at: now)]

        // At midnight "today" changes: add an entry for the new day so yesterday's total is never shown as today's.
        let midnight = calendar.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0, second: 5), matchingPolicy: .nextTime)
        if let midnight {
            entries.append(makeEntry(for: tenantId, at: midnight))
        }
        let soon = calendar.date(byAdding: .minute, value: 15, to: now) ?? now.addingTimeInterval(900)
        let nextRefresh = min(soon, midnight ?? soon)
        return Timeline(entries: entries, policy: .after(nextRefresh))
    }

    private func makeEntry(for tenantId: String?, at date: Date) -> OperixSalesEntry {
        guard let sales = OperixWidgetStore.sales(for: tenantId) else {
            return OperixSalesEntry(
                date: date,
                tenantName: "OperiX",
                currency: "EUR",
                sales: 0,
                orders: 0,
                salesDate: "No data",
                hasData: false
            )
        }

        // Numbers saved on an earlier day are not today's sales. Show zero for the new day and ask to sync.
        let isToday = sales.date == operixDayKey(date)
        return OperixSalesEntry(
            date: date,
            tenantName: sales.tenantName,
            currency: sales.currency,
            sales: isToday ? sales.sales : 0,
            orders: isToday ? sales.orders : 0,
            salesDate: isToday ? sales.date : operixDayKey(date),
            hasData: isToday
        )
    }
}

private struct OperixSalesWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: OperixSalesEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                Text("\(entry.tenantName): \(entry.formattedSales)")
            case .accessoryCircular:
                VStack(spacing: 1) {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                    Text(entry.formattedSales)
                        .font(.caption2)
                        .minimumScaleFactor(0.5)
                }
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.tenantName)
                        .font(.caption2)
                        .lineLimit(1)
                    Text(entry.formattedSales)
                        .font(.headline)
                    Text("\(entry.orders) orders today")
                        .font(.caption2)
                }
            case .systemSmall:
                VStack(alignment: .leading, spacing: 6) {
                    Label("Daily sales", systemImage: "chart.line.uptrend.xyaxis")
                        .font(.caption)
                        .lineLimit(1)
                    Text(entry.formattedSales)
                        .font(.title2.bold())
                        .minimumScaleFactor(0.65)
                    Text(entry.tenantName)
                        .font(.caption)
                        .lineLimit(1)
                    Text(entry.hasData ? "\(entry.orders) orders" : "Open OperiX to sync")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            default:
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Label("Daily sales", systemImage: "chart.line.uptrend.xyaxis")
                        Spacer()
                        Text(entry.salesDate)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Text(entry.tenantName)
                        .font(.headline)
                        .lineLimit(1)
                    HStack(alignment: .lastTextBaseline) {
                        Text(entry.formattedSales)
                            .font(.system(size: 30, weight: .bold))
                            .minimumScaleFactor(0.6)
                        Spacer()
                        Text("\(entry.orders) orders")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if !entry.hasData {
                        Text("Open OperiX to sync sales")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .widgetURL(URL(string: "operix-invoice://dashboard"))
        .padding()
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

struct OperixSalesWidget: Widget {
    let kind = operixWidgetKind

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: OperixSalesWidgetConfiguration.self,
            provider: OperixSalesProvider()
        ) { entry in
            OperixSalesWidgetView(entry: entry)
        }
        .configurationDisplayName("Daily sales")
        .description("Shows daily sales for a selected OperiX tenant.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}

@main
struct OperixSalesWidgetBundle: WidgetBundle {
    var body: some Widget {
        OperixSalesWidget()
    }
}
