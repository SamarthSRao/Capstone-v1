import math

class MMCAllocator:
    def __init__(self, service_rate_per_server, target_wait_prob=0.05, overprovision_factor=1):
        """
        service_rate_per_server: The maximum requests per hour a single server can handle.
        target_wait_prob: The maximum acceptable probability of a request having to wait in queue.
        overprovision_factor: Strategy to minimize SLA violations (e.g., adding an extra server).
        """
        self.mu = service_rate_per_server
        self.target_wait_prob = target_wait_prob
        self.overprovision_factor = overprovision_factor
        
    def erlang_c(self, c, rho):
        if rho >= c or rho <= 0:
            return 1.0 if rho >= c else 0.0
            
        import math
        lnum = c * math.log(rho) - math.lgamma(c + 1) + math.log(c / (c - rho))
        
        log_terms = [k * math.log(rho) - math.lgamma(k + 1) for k in range(c)]
        log_terms.append(lnum)
        
        max_log = max(log_terms)
        sum_exp = sum(math.exp(lt - max_log) for lt in log_terms)
        ldenom = max_log + math.log(sum_exp)
        
        return math.exp(lnum - ldenom)

    def get_required_servers(self, arrival_rate, uncertainty_margin=0):
        """
        Calculates the minimum number of servers `c` to meet the target waiting probability.
        arrival_rate: Forecasted workload (e.g., requests per hour)
        uncertainty_margin: Margin added to arrival rate based on predictive uncertainty
        """
        adjusted_rate = arrival_rate + uncertainty_margin
        
        if adjusted_rate <= 0:
            return max(1, self.overprovision_factor)
            
        rho = adjusted_rate / self.mu
        
        # Start checking from minimum theoretically stable servers
        c = max(1, math.floor(rho) + 1)
        
        while True:
            p_wait = self.erlang_c(c, rho)
            if p_wait <= self.target_wait_prob:
                # Add strategic overprovisioning to minimize SLA violations against volatility
                return c + self.overprovision_factor
            c += 1
