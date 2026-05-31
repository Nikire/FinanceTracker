import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, CalendarDays } from "lucide-react";

interface ResumenCardsProps {
  ingresosMensuales: number;
  gastosMensuales: number;
  gastosAnualesProximos: number;
  balance: number;
}

export function ResumenCards({
  ingresosMensuales,
  gastosMensuales,
  gastosAnualesProximos,
  balance,
}: ResumenCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Ingresos mensuales
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(ingresosMensuales)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Ingresos recurrentes</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Gastos mensuales
          </CardTitle>
          <TrendingDown className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(gastosMensuales)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Servicios activos</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Balance mensual
          </CardTitle>
          <Wallet className={`h-4 w-4 ${balance >= 0 ? "text-emerald-500" : "text-red-500"}`} />
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold ${balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {formatCurrency(balance)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Ingresos − gastos</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Próximos 30 días
          </CardTitle>
          <CalendarDays className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(gastosAnualesProximos)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Gastos anuales a vencer</p>
        </CardContent>
      </Card>
    </div>
  );
}
