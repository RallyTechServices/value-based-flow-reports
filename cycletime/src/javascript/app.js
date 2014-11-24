Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    model: 'PortfolioItem/EPIC',
    group_field: 'State',
    items: [
        {xtype:'container',itemId:'selector_box', layout: { type:'hbox' }, defaults: { margin: 5 }},
        {xtype:'container',itemId:'display_box', margin: 10},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addSelectors(this.down('#selector_box'));
    },
    _addSelectors: function(container){
        container.add({
            xtype:'rallyfieldvaluecombobox',
            model: this.model,
            field: this.group_field,
            labelWidth: 75,
            fieldLabel: 'Starting State',
            stateful: true,
            stateEvents: ['change'],
            stateId: 'rally.technicalservices.cycletime.start_value',
            listeners: {
                scope: this,
                change: function(combo) {
                    this.start_state = combo.getRecord();
                    this._enableButtonIfNecessary();
                }
            }
        });
        container.add({
            xtype:'rallyfieldvaluecombobox',
            model: this.model,
            field: this.group_field,
            labelWidth: 75,
            fieldLabel: 'Ending State',
            stateful: true,
            stateEvents: ['change'],
            stateId: 'rally.technicalservices.cycletime.end_value',
            listeners: {
                scope: this,
                change: function(combo) {
                    this.end_state = combo.getRecord();
                    this._enableButtonIfNecessary();
                }
            }
        });
        container.add({
            xtype:'rallybutton',
            text:'Calculate...',
            disabled: true,
            itemId: 'calculate_button',
            listeners: {
                scope:this,
                click:this._makeChart
            }
        });
    },
    _enableButtonIfNecessary: function() {
        this.logger.log("Start/End",this.start_state, this.end_state);
        this.down('#calculate_button').setDisabled(true);

        if ( this.end_state && this.start_state ) {
            var start_store = this.start_state.store;
            var end_store = this.end_state.store;
            this.logger.log("Indices of start/stop", start_store.indexOf(this.start_state), end_store.indexOf(this.end_state));
            if (start_store.indexOf(this.start_state) < end_store.indexOf(this.end_state)) {
                this.down('#calculate_button').setDisabled(false);
            }
        }
    },
    _makeChart: function(button){
        this.down('#display_box').removeAll();
        
        var project_oid = this.getContext().getProject().ObjectID;
        this.down('#display_box').add({
            xtype:'rallychart',
            storeConfig: {
                find: {
                    '_TypeHierarchy': this.model
                },
                fetch: ['ObjectID', this.group_field, '_ValidFrom', '_PreviousValues'],
                hydrate: [this.group_field],
                sort: { '_ValidFrom': 1 }
            },
            calculatorType: 'CycleCalculator',
            calculatorConfig: {
                initial_state: this.start_state.get('name'),
                final_state: this.end_state.get('name'),
                group_field: this.group_field
            },
            chartConfig: {
                chart: {
                    type: 'column'
                },
                title: {
                    text: 'Cycle Time'
                },
                
                xAxis: {
                    tickmarkPlacement: 'on',
                    tickInterval: 30,
                    title: {
                        text: 'Date Entered Final State'
                    }
                },
                yAxis: [{title:{text: 'Days'}}],
                plotOptions: {
                    series: {
                        marker: { enabled: false },
                        stacking: 'normal'
                    }
                }
                
            }
        });
    }
});