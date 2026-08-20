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

private struct StoredTenant: Codable {
    let id: String
    let name: String
}

private struct StoredTenantSales: Codable {
    let tenantId: String
    let tenantName: String
    let date: String
    let currency: String
    let sales: Double
    let orders: Int
}

private struct StoredSalesSnapshot: Codable {
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
        makeEntry(for: configuration.tenant?.id)
    }

    func timeline(for configuration: OperixSalesWidgetConfiguration, in context: Context) async -> Timeline<OperixSalesEntry> {
        let entry = makeEntry(for: configuration.tenant?.id)
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
        return Timeline(entries: [entry], policy: .after(nextRefresh))
    }

    private func makeEntry(for tenantId: String?) -> OperixSalesEntry {
        guard let sales = OperixWidgetStore.sales(for: tenantId) else {
            return OperixSalesEntry(
                date: Date(),
                tenantName: "OperiX",
                currency: "EUR",
                sales: 0,
                orders: 0,
                salesDate: "No data",
                hasData: false
            )
        }

        return OperixSalesEntry(
            date: Date(),
            tenantName: sales.tenantName,
            currency: sales.currency,
            sales: sales.sales,
            orders: sales.orders,
            salesDate: sales.date,
            hasData: true
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
                    Text("\(entry.orders) orders")
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
