import React from 'react';
import './DashboardCard.css';

const DashboardCard = ({ title, subtitle, headerRight, children }) => {
    return (
        <div className="dashboard-card">
            <div className="card-header">
                <div>
                    <h3 className="card-title">{title}</h3>
                    {subtitle && <p className="card-subtitle">{subtitle}</p>}
                </div>
                {headerRight && (
                    <div className="card-header-right">
                        {headerRight}
                    </div>
                )}
            </div>
            <div className="card-content">
                {children}
            </div>
        </div>
    );
};

export default DashboardCard;
